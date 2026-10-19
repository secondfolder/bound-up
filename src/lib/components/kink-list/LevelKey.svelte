<script lang="ts">
	import { LEVEL_LABELS, LEVELS } from '$lib/kink-list/answers';

	/**
	 * The key to the answer dots (`AnswerScale.svelte`): each level's colour
	 * and word, in scale order. Hidden from assistive tech, which hears each
	 * dot's own name instead.
	 */
</script>

<ul class="key" aria-hidden="true">
	{#each LEVELS as level (level)}
		<li style:--dot="var(--kink-level-{level})">
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

	.dot {
		inline-size: 0.75rem;
		block-size: 0.75rem;
		border-radius: 50%;
		background: var(--dot);
	}
</style>
