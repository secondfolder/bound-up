<script lang="ts">
	import { type MultiQuestion, pickResponse, picksOf } from '$lib/playroom/iq-test/questions';
	import Board from '../Board.svelte';
	import PolyominoShape, { spanOf } from '../PolyominoShape.svelte';
	import AnswerCard from './AnswerCard.svelte';
	import AnswerCards from './AnswerCards.svelte';

	/**
	 * Tick all that apply, then Done: as cards, or as a board's squares for
	 * visual memory. Last time's ticks are back when it is returned to. With
	 * a time limit, the card asks for what is `ticked()` when the time is up.
	 */
	let {
		question,
		previous,
		onanswer,
		span = 1
	}: {
		question: MultiQuestion;
		previous: string | null;
		onanswer: (response: string) => void;
		/** The size every shape is drawn at, so the one shown and the answers match. */
		span?: number;
	} = $props();

	// svelte-ignore state_referenced_locally
	let picked = $state<string[]>(picksOf(previous));

	function toggle(id: string) {
		picked = picked.includes(id) ? picked.filter((pick) => pick !== id) : [...picked, id];
	}

	/** What is ticked so far, as a response: for the card, when the time is up. */
	export function ticked(): string {
		return pickResponse(picked);
	}

	const square = $derived(question.choices.some((choice) => choice.polyomino || choice.icon));
	const drawnSpan = $derived(
		Math.max(span, spanOf(question.choices.flatMap((c) => (c.polyomino ? [c.polyomino] : []))))
	);
</script>

{#if question.grid}
	<Board
		grid={question.grid}
		mode="toggle"
		selected={picked.map(Number)}
		onselect={(cell) => toggle(String(cell))}
	/>
{:else}
	<AnswerCards heading="Tick all that apply" layout={square ? 'square' : 'text'}>
		{#each question.choices as choice, index (choice.id)}
			<AnswerCard
				{index}
				pressed={picked.includes(choice.id)}
				label={choice.polyomino || choice.icon ? choice.label : undefined}
				shape={square ? 'square' : 'text'}
				ticks
				onclick={() => toggle(choice.id)}
			>
				{#if choice.polyomino}
					<PolyominoShape cells={choice.polyomino} span={drawnSpan} />
				{:else if choice.icon}
					<span class="icon">{choice.icon}</span>
				{:else}
					<span>{choice.label}</span>
				{/if}
			</AnswerCard>
		{/each}
	</AnswerCards>
{/if}
<div class="done">
	<wa-button variant="brand" disabled={picked.length === 0} onclick={() => onanswer(ticked())}>Done</wa-button>
</div>

<style>
	.icon {
		display: grid;
		place-items: center;
		block-size: 100%;
		font-size: 2.5rem;
		line-height: 1;
	}

	.done {
		display: flex;
		justify-content: flex-end;
	}
</style>
