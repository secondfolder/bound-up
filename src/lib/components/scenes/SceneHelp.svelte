<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import { insertMenuFrom, visibleText } from '$lib/lexical/plugins/scene-blocks';
	import type { SceneSection } from '$lib/scenes/blocks';
	import type { HelpGate } from '$lib/scenes/help-gate.svelte';
	import type { MissedAnswer } from '$lib/scenes/model-help';

	/**
	 * The column's "Ask the model" buttons: what might be missing, and a menu
	 * drawn from the page. Nothing here runs unless pressed, and the first
	 * press asks the person to agree to what is sent (`HelpGate`). What is
	 * sent is the page as this person sees it, without a partner's surprise.
	 * See docs/scenes.md, "Help from the model".
	 */
	let {
		gate,
		editor,
		userId,
		readOnly,
		onAdd
	}: {
		gate: HelpGate;
		editor: LexicalEditor | null;
		userId: string;
		readOnly: boolean;
		onAdd: (section: SceneSection, text: string) => void;
	} = $props();

	let ideas = $state.raw<MissedAnswer['ideas']>([]);

	const page = () => (editor ? visibleText(editor, userId) : '');

	async function missed() {
		const answer = await gate.ask({ task: 'missed', page: page() });
		if (answer?.task === 'missed') {
			({ ideas } = answer);
		}
	}

	async function menu() {
		const answer = await gate.ask({ task: 'menu', page: page() });
		if (answer?.task === 'menu' && editor) {
			insertMenuFrom(editor, answer.courses);
		}
	}

	function add(idea: MissedAnswer['ideas'][number]) {
		onAdd(idea.section, `${idea.title} `);
		ideas = ideas.filter((each) => each !== idea);
	}
</script>

{#if gate.available}
	<section class="help" aria-label="Ask the model">
		<p class="lead">Want a hand? The model only reads this scene when you ask.</p>
		<div class="buttons">
			<wa-button size="s" appearance="outlined" disabled={gate.busy !== null} onclick={missed}>
				<wa-icon slot="start" name="wand-magic-sparkles"></wa-icon>
				{gate.busy === 'missed' ? 'Thinking…' : 'What might we have missed?'}
			</wa-button>
			<wa-button
				size="s"
				appearance="outlined"
				disabled={readOnly || gate.busy !== null}
				onclick={menu}
			>
				<wa-icon slot="start" name="utensils"></wa-icon>
				{gate.busy === 'menu' ? 'Thinking…' : 'Suggest a menu'}
			</wa-button>
		</div>
		{#if gate.error}<p class="problem" role="alert">{gate.error}</p>{/if}
		{#each ideas as idea (idea.title)}
			<article class="idea">
				<h3>{idea.title}</h3>
				<p>{idea.why}</p>
				<wa-button size="s" appearance="outlined" disabled={readOnly} onclick={() => add(idea)}>
					<wa-icon slot="start" name="plus"></wa-icon>
					Add a note
				</wa-button>
			</article>
		{/each}
	</section>
{/if}

<style>
	.help {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	.lead,
	.idea p {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-xs);
	}

	.idea {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--wa-space-xs);
		padding: var(--wa-space-s) var(--wa-space-m);
		border: var(--wa-border-width-s) dashed var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
	}

	h3 {
		margin: 0;
		font-size: var(--wa-font-size-m);
	}

	.problem {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-danger);
	}
</style>
