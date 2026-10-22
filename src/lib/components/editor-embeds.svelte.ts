import { $isAutoLinkNode as isAutoLinkNode } from '@lexical/link';
import { $findMatchingParent as findMatchingParent } from '@lexical/utils';
import {
	BLUR_COMMAND,
	COLLABORATION_TAG,
	COMMAND_PRIORITY_LOW,
	// biome-ignore lint/suspicious/noDeprecatedImports: only the overload that takes a type argument is deprecated, and this calls the plain one.
	$getNodeByKey as getNodeByKey,
	$getSelection as getSelection,
	HISTORIC_TAG,
	$isRangeSelection as isRangeSelection,
	type LexicalEditor,
	mergeRegister
} from 'lexical';
import { mount, unmount } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { $isEmbedNode as isEmbedNode } from '$lib/lexical/nodes/embed';
import { ADD_EMBED_COMMAND } from '$lib/lexical/nodes/shared/embed-offer';
import {
	$autoLinksAwaitingEmbeds as autoLinksAwaitingEmbeds,
	$insertEmbedForLink as insertEmbedForLink,
	$insertEmbedForUrl as insertEmbedForUrl,
	trackEmbedDismissals
} from '$lib/richtext-editor';
import ComposerEmbed from './ComposerEmbed.svelte';

/**
 * Embeds in an editor: mounting each one as a Svelte component, and putting
 * one above every finished auto-link.
 *
 * Shared by `RichTextEditor` and the notebook's `CollaborativeEditor`, which
 * differ in where their content comes from but not in how an embed behaves.
 * Pulled out of `RichTextEditor` rather than copied, so the two cannot drift.
 */

export type EditorEmbeds = {
	/** Inserts every embed still owed. `ignoreCaret` counts the link under the caret as finished too. */
	sweep: (ignoreCaret?: boolean) => void;
	destroy: () => void;
};

/**
 * Registers embed handling on `editor`.
 *
 * **Register before loading content**: the decorator listener only fires on
 * commits, so one added afterwards would never hear about the embeds that
 * arrived with the initial document.
 *
 * A remote edit (a partner's typing, or a Yjs undo) is never swept. Every
 * device would otherwise answer the same new link by inserting its own embed,
 * and the document would gain one per device watching. Only the device whose
 * writer typed the link inserts it, and the embed reaches everyone else as an
 * ordinary edit.
 */
export function registerEditorEmbeds(editor: LexicalEditor): EditorEmbeds {
	/**
	 * URLs whose embed the writer removed.
	 *
	 * Plain state, not persisted anywhere: the decision belongs to this draft,
	 * and a sent message carries the result rather than the reasoning. Kept
	 * with the editor rather than in the document so it dies with it: clearing
	 * the box after a send starts everyone fresh.
	 */
	const dismissedEmbeds = new SvelteSet<string>();

	/**
	 * Lexical's decorators, mounted as real Svelte components.
	 *
	 * Lexical renders nothing itself for a `DecoratorNode`: it collects what
	 * each one's `decorate()` returns into a record keyed by node and hands
	 * that to this listener after every commit, leaving the host framework to
	 * put something in the element it reconciled. React has portals for this;
	 * Svelte has `mount`, so each embed is its own tiny component root.
	 *
	 * The record is complete every time, so a key that is gone has been
	 * deleted and its component has to be unmounted: Svelte roots are not
	 * cleaned up by their DOM disappearing, and each one holds an
	 * `IntersectionObserver` and a scroll listener through `UrlEmbed`.
	 */
	const embeds = new SvelteMap<string, { url: string; component: Record<string, unknown> }>();

	const removeEmbed = (key: string) =>
		editor.update(() => {
			const node = getNodeByKey(key);
			if (isEmbedNode(node)) {
				node.remove();
			}
		});

	const offDecorators = editor.registerDecoratorListener<string>((decorators) => {
		for (const [key, mounted] of embeds) {
			if (decorators[key] === mounted.url) {
				continue;
			}
			void unmount(mounted.component);
			embeds.delete(key);
		}
		for (const [key, url] of Object.entries(decorators)) {
			if (embeds.has(key)) {
				continue;
			}
			const target = editor.getElementByKey(key);
			if (!target) {
				continue;
			}
			const component = mount(ComposerEmbed, {
				target,
				props: { url, onRemove: () => removeEmbed(key) }
			}) as Record<string, unknown>;
			embeds.set(key, { url, component });
		}
	});

	/**
	 * Embeds appear above the paragraph of any finished auto-link.
	 *
	 * "Finished" means the caret is not inside it: typing a URL shows no
	 * embed until you move off, so nothing pops up mid-word. Every *other*
	 * embeddable link gets one straight away, which is what makes a pasted
	 * block of text (or several URLs entered at once) come out with all of
	 * its embeds rather than just the last.
	 *
	 * `registerAutoLink` works through node transforms that run after the
	 * update callback returns, so the links only exist to be noticed on a
	 * later tick. That is why this hangs off the update listener rather than
	 * off the keystroke that produced them.
	 *
	 * A URL whose embed has been removed is skipped for good; see
	 * `dismissedEmbeds`. Without that, the same caret move that inserts an
	 * embed in the first place would put it straight back, and the remove
	 * button would look broken every time the writer went back to fix a typo.
	 */
	let settling = false;

	const caretLinkKey = (): string | null => {
		const selection = getSelection();
		if (!isRangeSelection(selection)) {
			return null;
		}
		return findMatchingParent(selection.anchor.getNode(), isAutoLinkNode)?.getKey() ?? null;
	};

	const sweep = (ignoreCaret = false) => {
		if (settling) {
			return;
		}
		let work = false;
		editor.getEditorState().read(() => {
			work =
				autoLinksAwaitingEmbeds(ignoreCaret ? null : caretLinkKey(), dismissedEmbeds).length > 0;
		});
		if (!work) {
			return;
		}
		// Guarded because this runs *from* an update listener, and an
		// unguarded update from there is an infinite loop.
		settling = true;
		editor.update(
			() => {
				for (const link of autoLinksAwaitingEmbeds(
					ignoreCaret ? null : caretLinkKey(),
					dismissedEmbeds
				)) {
					insertEmbedForLink(link);
				}
			},
			{
				onUpdate: () => {
					settling = false;
				}
			}
		);
	};

	const offUpdate = editor.registerUpdateListener(({ editorState, prevEditorState, tags }) => {
		if (tags.has(COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) {
			return;
		}
		// Before the sweep, always: this is what tells the sweep that the
		// embed it is about to re-insert was just deleted on purpose.
		trackEmbedDismissals(prevEditorState, editorState, dismissedEmbeds);
		sweep();
	});

	const offCommands = mergeRegister(
		// Leaving the field entirely counts as moving off the link too: the case
		// where someone types a URL and immediately clicks Send.
		editor.registerCommand(
			BLUR_COMMAND,
			() => {
				sweep(true);
				return false;
			},
			COMMAND_PRIORITY_LOW
		),
		/**
		 * A link's own "Show embed" button; see `ADD_EMBED_COMMAND`. Handled
		 * here rather than in `richtext-editor.ts` because putting the embed
		 * back also lifts the dismissal, and `dismissedEmbeds` lives here.
		 * Command listeners already run inside an update.
		 */
		editor.registerCommand(
			ADD_EMBED_COMMAND,
			(url) => {
				dismissedEmbeds.delete(url);
				insertEmbedForUrl(url);
				return true;
			},
			COMMAND_PRIORITY_LOW
		)
	);

	return {
		sweep,
		destroy: () => {
			offUpdate();
			offCommands();
			offDecorators();
			for (const mounted of embeds.values()) {
				void unmount(mounted.component);
			}
			embeds.clear();
		}
	};
}
