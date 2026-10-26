<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import { onDestroy, type Snippet } from 'svelte';
	import {
		addMenuItem,
		addToSection,
		type BlockAtCaret,
		blockAtCaret,
		insertMenu,
		insertSection,
		visibleText
	} from '$lib/lexical/plugins/scene-blocks';
	import type { NotebookSession } from '$lib/notebook/session.svelte';
	import { SCENE_SECTIONS, type SceneSection, SECTION_LABELS } from '$lib/scenes/blocks';
	import type { Mentioned, PromptOutcome } from '$lib/scenes/considerations';
	import { NOTHING_MENTIONED } from '$lib/scenes/considerations';
	import { HelpGate } from '$lib/scenes/help-gate.svelte';
	import { addLine } from '$lib/scenes/page-edits';
	import {
		type ScenePreferencesData,
		ScenePreferencesStore
	} from '$lib/scenes/preferences-store.svelte';
	import { recognise, sameMentions } from '$lib/scenes/recognise';
	import { clearOutcome, readOutcomes, setOutcome, watchOutcomes } from '$lib/scenes/scene-doc';
	import type { KinkChip } from '$lib/scenes/shared-kinks';
	import type { DaydreamLibraryItemView, KinkListView } from '$lib/types';
	import HelpConsent from './HelpConsent.svelte';
	import KinkChips from './KinkChips.svelte';
	import MenuOptions from './MenuOptions.svelte';
	import PromptColumn from './PromptColumn.svelte';
	import SceneHelp from './SceneHelp.svelte';
	import StoryIdeas from './StoryIdeas.svelte';

	/**
	 * The live half of a scene's prompt column: the person's own settings,
	 * this scene's outcomes from its shared document, and what the page
	 * mentions, worked out on this device as the page changes. See
	 * docs/scenes.md.
	 */
	let {
		session,
		editor,
		preferences: preferencesData,
		userId,
		readOnly,
		partnershipId = null,
		kinkLists = { own: null, mineForPartner: null, theirs: null },
		characters = [],
		help = { available: false, accepted: false },
		partnerId = null,
		onMode,
		kinks,
		blocks,
		story
	}: {
		session: NotebookSession;
		/** The page's editor once bound; null before then. */
		editor: LexicalEditor | null;
		preferences: ScenePreferencesData;
		userId: string;
		readOnly: boolean;
		partnershipId?: string | null;
		kinkLists?: {
			own: KinkListView | null;
			mineForPartner: KinkListView | null;
			theirs: KinkListView | null;
		};
		characters?: DaydreamLibraryItemView[];
		/** Whether the model can be asked, and whether this person has agreed to it. */
		help?: { available: boolean; accepted: boolean };
		/** Who a menu or an item can be hidden from; null in a solo scene. */
		partnerId?: string | null;
		/** Told when the column turns into the menu's options and back, for its title. */
		onMode?: (mode: 'prompts' | 'menu') => void;
		kinks?: Snippet<[number]>;
		blocks?: Snippet<[number]>;
		story?: Snippet<[number]>;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Read once: the store keeps its own revision from here, and a refresh of
	// the load must not throw away a change that is still being saved.
	const store = new ScenePreferencesStore(preferencesData);
	void store.open();
	onDestroy(() => store.destroy());

	let outcomes = $state.raw<ReadonlyMap<string, PromptOutcome>>(new Map());
	$effect(() => {
		const { doc } = session;
		outcomes = readOutcomes(doc);
		return watchOutcomes(doc, () => {
			outcomes = readOutcomes(doc);
		});
	});

	// svelte-ignore state_referenced_locally
	// Read once: the gate keeps whether they have agreed from here on.
	const gate = new HelpGate(help);

	/**
	 * The block the caret is in: inside a menu the column is the menu's
	 * options rather than ideas and prompts. Followed through the editor's
	 * updates, which a press in this column does not cause, so the options
	 * stay while they are being used.
	 */
	let at = $state.raw<BlockAtCaret | null>(null);
	$effect(() => {
		const bound = editor;
		if (!bound) {
			return;
		}
		const read = () => {
			at = blockAtCaret(bound);
		};
		read();
		return bound.registerUpdateListener(read);
	});
	const menu = $derived(at?.kind === 'menu' ? at : null);
	$effect(() => {
		onMode?.(menu ? 'menu' : 'prompts');
	});

	const RECOGNISE_DELAY_MS = 400;
	let mentioned = $state.raw<Mentioned>(NOTHING_MENTIONED);
	$effect(() => {
		const bound = editor;
		if (!bound) {
			return;
		}
		let timer: ReturnType<typeof setTimeout> | null = null;
		const update = () => {
			// What this viewer can see: a partner's surprise must not bring up
			// prompts that give away what is in it.
			const next = recognise(visibleText(bound, userId));
			if (!sameMentions(next, mentioned)) {
				mentioned = next;
			}
		};
		update();
		const off = bound.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
			if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
				return;
			}
			if (timer) {
				clearTimeout(timer);
			}
			timer = setTimeout(update, RECOGNISE_DELAY_MS);
		});
		return () => {
			off();
			if (timer) {
				clearTimeout(timer);
			}
		};
	});

	/** General notes are plain lines; anything else goes in the section of its kind. */
	function addToPage(section: SceneSection, text: string) {
		if (!editor || readOnly) {
			return;
		}
		if (section === 'notes') {
			addLine(editor, text);
		} else {
			addToSection(editor, section, text);
		}
	}

	/** Into a menu when there is one, with the kink it is; otherwise a line of its own. */
	function pickKink(chip: KinkChip) {
		if (editor && !readOnly) {
			addMenuItem(editor, chip.sides ? `${chip.name} (${chip.sides.toLowerCase()})` : chip.name, {
				kinkId: chip.kinkId
			});
		}
	}

	const BLOCK_HINTS: Record<SceneSection, string> = {
		notes: 'Anything else worth writing down',
		signals: 'How you’ll stop, slow down and check in',
		limits: 'What’s off the table, or only to be talked about',
		aftercare: 'What each of you wants afterwards',
		ritual: 'How it begins and how it ends',
		prep: 'What happens beforehand, and what to have ready',
		story: 'Who you are, where you are, what’s going on'
	};

	function changeOutcome(promptId: string, outcome: PromptOutcome | null) {
		if (readOnly) {
			return;
		}
		if (outcome === null) {
			clearOutcome(session.doc, promptId);
		} else {
			setOutcome(session.doc, promptId, outcome, userId);
		}
	}
</script>

{#snippet kinkList(level: number)}
	<KinkChips {kinkLists} {partnershipId} {level} {readOnly} onPick={pickKink} />
{/snippet}

{#snippet storyIdeas(level: number)}
	<StoryIdeas {editor} {level} {readOnly} {characters} {gate} {userId} />
{/snippet}

{#snippet blockList(level: number)}
	<ul class="blocks">
		<li>
			<wa-button
				size="s"
				appearance="outlined"
				disabled={readOnly || !editor}
				onclick={() => editor && insertMenu(editor)}
			>
				<wa-icon slot="start" name="utensils"></wa-icon>
				Menu
			</wa-button>
			<span>Courses to choose from as you go</span>
		</li>
		{#each SCENE_SECTIONS.filter((section) => section !== 'notes' && (level >= 2 || ['signals', 'limits', 'aftercare'].includes(section))) as section (section)}
			<li>
				<wa-button
					size="s"
					appearance="outlined"
					disabled={readOnly || !editor}
					onclick={() => editor && insertSection(editor, section)}
				>
					{SECTION_LABELS[section]}
				</wa-button>
				<span>{BLOCK_HINTS[section]}</span>
			</li>
		{/each}
	</ul>
{/snippet}

{#if gate.consenting}<HelpConsent {gate} />{/if}

{#if menu && editor}
	<MenuOptions {editor} {menu} {partnerId} {readOnly} />
{:else}
<PromptColumn
	preferences={store.preferences}
	onPreferences={(next) => store.change(next)}
	{mentioned}
	{outcomes}
	{readOnly}
	onAdd={addToPage}
	onOutcome={changeOutcome}
	kinks={kinks ?? kinkList}
	blocks={blocks ?? blockList}
	story={story ?? storyIdeas}
/>

<!-- Last: the column is about the page, and the model only helps when asked. -->
<SceneHelp {gate} {editor} {userId} {readOnly} onAdd={addToPage} />
{/if}
{#if store.saveError}
	<p class="problem" role="alert">{store.saveError}</p>
{/if}

<style>
	.blocks {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.blocks li {
		display: flex;
		align-items: center;
		gap: var(--wa-space-s);
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.problem {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-danger);
	}
</style>
