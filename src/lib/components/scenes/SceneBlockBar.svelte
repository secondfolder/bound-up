<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import {
		type BlockAtCaret,
		blockAtCaret,
		blockToText,
		setHidden
	} from '$lib/lexical/plugins/scene-blocks';
	import { SECTION_LABELS } from '$lib/scenes/blocks';
	import '$lib/components/choice-controls.css';

	/**
	 * What can be done with the section the caret is in, above the page: hide
	 * it from the partner, or turn it back into text. A menu's options are in
	 * the sidebar instead (`MenuOptions`), and turning lines into a menu is on
	 * the selection's toolbar. See docs/scenes.md, "Blocks".
	 *
	 * Follows the caret through the editor's own update listener, so it is
	 * right after every keystroke and every partner's edit alike.
	 */
	let {
		editor,
		partnerId,
		readOnly
	}: {
		editor: LexicalEditor;
		/** The partner a section can be hidden from; null in a solo scene. */
		partnerId: string | null;
		readOnly: boolean;
	} = $props();

	let at = $state.raw<BlockAtCaret | null>(null);

	$effect(() => {
		const bound = editor;
		const read = () => {
			at = blockAtCaret(bound);
		};
		read();
		return bound.registerUpdateListener(read);
	});

	const section = $derived(at?.kind === 'section' ? at : null);
</script>

{#if section && !readOnly}
	<div class="block-bar" role="toolbar" aria-label="Scene block">
		<span class="what">{SECTION_LABELS[section.section]}</span>
		{#if partnerId}
			<!-- A toggle, so a native button: wa-button forwards no aria-pressed. -->
			<button
				type="button"
				class="choice-chip"
				aria-pressed={section.hiddenFrom !== null}
				onclick={() =>
					partnerId &&
					setHidden(editor, section.key, section.hiddenFrom === null ? partnerId : null)}
			>
				Only me
			</button>
		{/if}
		<wa-button size="s" appearance="plain" onclick={() => blockToText(editor, section.key)}>
			Back to text
		</wa-button>
	</div>
{/if}

<style>
	.block-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--wa-space-xs) var(--wa-space-s);
	}

	.what {
		font-size: var(--wa-font-size-s);
		font-weight: var(--wa-font-weight-semibold);
		color: var(--wa-color-text-quiet);
	}
</style>
