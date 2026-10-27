<script lang="ts">
	import { resolve } from '$app/paths';
	import type { GuideView } from '$lib/types';

	let { guides }: { guides: GuideView[] } = $props();
</script>

<!-- A column of cards, like every other list under Home. It was a row with no
     wrapping, which ran off the side of a phone past two or three titles. -->
<ul>
	{#each guides as guide (guide.id)}
		<li>
			<a href={resolve('/(auth-required)/(app)/guides/[id]', { id: guide.id })}>
				<wa-icon name="book-open" variant="solid"></wa-icon>
				<span class="title">{guide.title}</span>
				<wa-icon class="go" name="chevron-right" variant="solid"></wa-icon>
			</a>
		</li>
	{/each}
</ul>

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.title {
		flex: 1 1 auto;
		min-inline-size: 0;
	}

	a {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-block-size: 2.75rem;
		padding: var(--wa-space-s) var(--wa-space-m);
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-panel-border-radius);
		background: var(--wa-color-surface-default);
		color: inherit;
		text-decoration: none;
		font-weight: var(--wa-font-weight-semibold, 600);
		-webkit-tap-highlight-color: transparent;

		&:hover .title,
		&:focus-visible .title {
			text-decoration: underline;
		}
	}

	wa-icon {
		flex: none;
		color: var(--wa-color-brand-fill-loud);
	}

	.go {
		color: var(--wa-color-text-quiet);
		font-size: 0.875em;
	}

	@media (prefers-reduced-motion: no-preference) {
		.go {
			transition: transform 150ms ease-out;
		}

		a:hover .go,
		a:focus-visible .go {
			transform: translateX(3px);
		}
	}
</style>
