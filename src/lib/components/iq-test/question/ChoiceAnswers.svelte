<script lang="ts">
	import type { ChoiceQuestion } from '$lib/playroom/iq-test/questions';
	import ShapeCell from '../ShapeCell.svelte';
	import AnswerCard from './AnswerCard.svelte';
	import AnswerCards from './AnswerCards.svelte';
	import { INK } from './ink';

	/** Pick one: clicking answers and moves on, as an online test does. */
	let {
		question,
		previous,
		onanswer
	}: {
		question: ChoiceQuestion;
		previous: string | null;
		onanswer: (response: string) => void;
	} = $props();

	/** How each card is drawn in each layout. */
	const CARD_SHAPES = { square: 'square', swatches: 'swatch', text: 'text' } as const;

	const layout = $derived.by((): keyof typeof CARD_SHAPES => {
		if (question.choices.some((choice) => choice.cell)) {
			return 'square';
		}
		return question.choices.some((choice) => choice.swatch) ? 'swatches' : 'text';
	});
</script>

<AnswerCards heading="Answers" {layout}>
	{#each question.choices as choice, index (choice.id)}
		<AnswerCard
			{index}
			pressed={previous === choice.id}
			label={choice.cell || choice.swatch ? choice.label : undefined}
			shape={CARD_SHAPES[layout]}
			color={choice.ink ? INK[choice.ink] : undefined}
			onclick={() => onanswer(choice.id)}
		>
			{#if choice.cell}
				<ShapeCell cell={choice.cell} />
			{:else if choice.swatch}
				<span class="swatch" style:background={INK[choice.swatch]}></span>
			{:else}
				<span>{choice.label}</span>
			{/if}
		</AnswerCard>
	{/each}
</AnswerCards>

<style>
	.swatch {
		display: block;
		inline-size: 100%;
		block-size: 2.75rem;
		border-radius: var(--wa-border-radius-s);
	}
</style>
