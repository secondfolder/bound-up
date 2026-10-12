<script lang="ts">
	import type { PointQuestion } from '$lib/playroom/iq-test/questions';
	import Board from '../Board.svelte';

	/**
	 * Pick one square of the board, the points marked on it: like a choice,
	 * clicking answers and moves on.
	 */
	let {
		question,
		previous,
		onanswer,
		hidePoints = false
	}: {
		question: PointQuestion;
		previous: string | null;
		onanswer: (response: string) => void;
		/** A timed question's points, once the time to look is up: the centre from memory. */
		hidePoints?: boolean;
	} = $props();
</script>

<Board
	grid={question.grid}
	mode="pick"
	marked={hidePoints ? [] : question.points}
	selected={previous === null ? [] : [Number(previous)]}
	onselect={(cell) => onanswer(String(cell))}
/>
