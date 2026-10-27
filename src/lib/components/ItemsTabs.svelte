<script lang="ts">
	import { resolve } from '$app/paths';

	/**
	 * Tasks | Rewards, at the top of both pages: two routes that read as one
	 * place, since completing tasks is what pays for rewards. Links rather than
	 * tabs over panels (and so not `SegmentedTabs`): each is a page with its own
	 * URL, its own sheets and its own history. The current one is
	 * `aria-current="page"`.
	 */
	let { current }: { current: 'tasks' | 'rewards' } = $props();

	const links = [
		{ key: 'tasks', label: 'Tasks', href: resolve('/(auth-required)/(app)/tasks') },
		{ key: 'rewards', label: 'Rewards', href: resolve('/(auth-required)/(app)/rewards') }
	] as const;
</script>

<nav class="tabs" aria-label="Tasks and rewards">
	{#each links as link (link.key)}
		<a
			href={link.href}
			class={{ current: current === link.key }}
			aria-current={current === link.key ? 'page' : undefined}>{link.label}</a
		>
	{/each}
</nav>

<style>
	/* The same pill as the segmented control, drawn for two links. */
	.tabs {
		display: flex;
		align-self: flex-start;
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: 999px;
		background: var(--wa-color-surface-lowered);
	}

	a {
		display: flex;
		align-items: center;
		min-block-size: 2.25rem;
		padding-inline: 1rem;
		border-radius: 999px;
		color: var(--wa-color-text-quiet);
		font-weight: var(--wa-font-weight-semibold, 600);
		text-decoration: none;

		&.current {
			background: var(--wa-color-surface-raised);
			color: var(--wa-color-text-normal);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}
</style>
