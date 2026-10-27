<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { submitDebugToggle } from '$lib/debug-toggle';

	let {
		debugAvailable = false,
		debugOn = false
	}: {
		/** The account holds `debugMode`, so the corner toggle is there at all. */
		debugAvailable?: boolean;
		/** Debug mode is on for this device. See docs/debug-mode.md. */
		debugOn?: boolean;
	} = $props();

	const settingsHref = resolve('/(auth-required)/(app)/settings');

	const app = '/(auth-required)/(app)';

	/**
	 * The five places, and the routes each stays lit on. Exactly five, with no
	 * tab per partner: whose things a page shows is the context switcher's
	 * job now (docs/contexts.md), and a bottom bar stops being usable past
	 * about five. Prefix matches, so a tab stays lit on its child routes.
	 */
	const tabs = [
		{
			label: 'Today',
			icon: 'house',
			href: resolve('/(auth-required)/(app)/today'),
			// Guides, daydreams and the Playroom have no tab of their own: they
			// are reached from Today's cards, so Today stays lit inside them
			// rather than the nav showing no tab at all.
			prefixes: [`${app}/today`, `${app}/guides`, `${app}/daydreams`, `${app}/playroom`]
		},
		{
			label: 'Tasks',
			icon: 'list-check',
			href: resolve('/(auth-required)/(app)/tasks'),
			// Rewards are a tab inside Tasks (`ItemsTabs`), so the one place.
			prefixes: [`${app}/tasks`, `${app}/rewards`]
		},
		{
			label: 'Notebook',
			icon: 'book',
			href: resolve('/(auth-required)/(app)/notebook'),
			prefixes: [`${app}/notebook`]
		},
		{
			label: 'Messages',
			icon: 'envelope',
			href: resolve('/(auth-required)/(app)/messages'),
			prefixes: [`${app}/messages`]
		},
		{
			label: 'Settings',
			icon: 'gear',
			href: settingsHref,
			// Admin and debug are reached from Settings and have no tab of their
			// own, likewise.
			prefixes: [`${app}/settings`, `${app}/admin`, `${app}/debug`]
		}
	];

	// The active tab is decided on `page.route.id`, NOT on a pathname compared
	// against resolve()'s output: during SSR resolve() returns a path relative
	// to the page being rendered ('./today', '../today'), which never equals
	// page.url.pathname, so the highlight was missing until hydration.
	const routeId = $derived(page.route.id);
	const isCurrent = $derived((prefixes: readonly string[]) =>
		prefixes.some((prefix) => routeId === prefix || (routeId?.startsWith(`${prefix}/`) ?? false))
	);
</script>

<nav aria-label="Primary">
	<div class="tabs">
		{#each tabs as tab (tab.label)}
			<a href={tab.href} aria-current={isCurrent(tab.prefixes) ? 'page' : undefined}>
				<wa-icon name={tab.icon} variant="solid"></wa-icon>
				<span>{tab.label}</span>
			</a>
		{/each}
	</div>

	{#if debugAvailable}
		<!-- A quick way in and out of debug mode from any screen. Unseen until
		     hovered while off, so it is no clutter for someone who holds the
		     feature and is not debugging; always seen while on, so debug mode is
		     never left on by accident. A native button rather than a wa-button
		     because it is a toggle: wa-button would leave `aria-pressed` on its
		     host, never reaching the inner <button>. Being native, it takes its
		     name from `aria-label`, and the icon is decoration. -->
		<form
			class="debug"
			method="POST"
			action="{settingsHref}?/debug"
			use:enhance={submitDebugToggle}
		>
			<input type="hidden" name="on" value={String(!debugOn)} />
			<button type="submit" aria-label="Debug mode" aria-pressed={debugOn} class:on={debugOn}>
				<wa-icon name="bug" variant="solid"></wa-icon>
			</button>
		</form>
	{/if}
</nav>

<style>
	nav {
		/* The tabs sit centred in the middle column, with the debug toggle in
		   the right-hand one: a column of its own, so it never covers a tab on
		   a narrow phone. The left column only balances it. */
		display: grid;
		grid-template-columns: 1fr minmax(0, auto) 1fr;
		align-items: stretch;

		background-color: var(--wa-color-surface-raised, var(--wa-color-surface));
		border-top: 1px solid var(--wa-color-surface-border);
		/* Home-indicator gutter on iOS; 0 everywhere else. */
		padding-bottom: var(--safe-area-inset-bottom-min);

		.tabs {
			grid-column: 2;
			display: flex;
			justify-content: center;
			gap: 1em;
			min-width: 0;
		}

		a {
			/* Sized to their content rather than sharing the width out, so the
			   tabs bunch in the middle. */
			flex: 0 1 auto;
			min-width: 3rem;
			max-width: 6rem;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 0.25rem;
			padding: 0.5rem 0.25rem;

			text-decoration: none;
			color: var(--wa-color-text-quiet);
			/* Kills the grey flash on tap that makes a web nav feel non-native. */
			-webkit-tap-highlight-color: transparent;

			/* One box per icon, so every label sits on the same line whatever
			   the glyph's own height. */
			wa-icon {
				block-size: 1.75rem;
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 1.5rem;
			}

			span {
				/* Not smaller: these are the only words on the nav. */
				font-size: 0.75rem;
				line-height: 1;
				max-width: 100%;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			&[aria-current='page'] {
				color: var(--wa-color-brand-fill-loud, var(--wa-color-text-link));
			}
		}

		.debug {
			grid-column: 3;
			justify-self: end;
			align-self: end;
			display: flex;

			button {
				display: flex;
				align-items: center;
				justify-content: center;
				width: 2rem;
				height: 2rem;
				padding: 0;
				border: none;
				background: none;
				color: var(--wa-color-text-quiet);
				cursor: pointer;
				-webkit-tap-highlight-color: transparent;
				opacity: 0;
				transition: opacity 150ms;

				&:hover,
				&:focus-visible {
					opacity: 1;
				}

				&.on {
					opacity: 1;
					color: var(--wa-color-brand-fill-loud, var(--wa-color-text-link));
				}
			}
		}
	}
</style>
