<script lang="ts">
	import { LEVEL_LABELS, LEVELS } from '$lib/kink-list/answers';
	import './level-glyphs.css';

	/**
	 * The key to the answer dots (`AnswerScale.svelte`): each level's colour,
	 * mark and word, in scale order. Hidden from assistive tech, which hears each
	 * dot's own name instead.
	 */
</script>

<ul class="key" aria-hidden="true">
	{#each LEVELS as level (level)}
		<li style:--dot="var(--kink-level-{level})" data-kink-level={level}>
			<span class="dot"></span>{LEVEL_LABELS[level]}
		</li>
	{/each}
</ul>

<style>
	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 0.8125rem;

		li {
			display: flex;
			align-items: center;
			gap: 0.3rem;
			margin: 0;
			white-space: nowrap;
		}
	}

	/* A chosen dot in small, mark and all, so the key teaches the marks too. */
	.dot {
		display: grid;
		place-items: center;
		inline-size: 0.875rem;
		block-size: 0.875rem;
		border-radius: 50%;
		background: var(--dot);

		&::after {
			content: '';
			inline-size: 0.5rem;
			block-size: 0.5rem;
			background: var(--kink-level-ink);
			mask: var(--kink-glyph) center / contain no-repeat;
		}
	}

	/* Tighter on a phone, where it is pinned over the list and every line of
	   it is a line of list not seen. */
	@media (width < 40rem) {
		.key {
			gap: 0.125rem 0.5rem;
			font-size: 0.75rem;
		}
	}
</style>
