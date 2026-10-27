<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { submitDebugToggle } from '$lib/debug-toggle';
	import { initialsFor } from '$lib/initials';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { PartnerView } from '$lib/types';

	let {
		partners,
		debugAvailable = false,
		debugOn = false
	}: {
		partners: PartnerView[];
		/** The account holds `debugMode`, so the corner toggle is there at all. */
		debugAvailable?: boolean;
		/** Debug mode is on for this device. See docs/debug-mode.md. */
		debugOn?: boolean;
	} = $props();

	const homeHref = resolve('/(auth-required)/(app)/home');
	const settingsHref = resolve('/(auth-required)/(app)/settings');

	// The active tab is decided on `page.route.id`, NOT on a pathname compared
	// against resolve()'s output: during SSR resolve() returns a path relative
	// to the page being rendered ('./home', '../home'), which never equals
	// page.url.pathname, so the highlight was missing until hydration.
	const routeId = $derived(page.route.id);
	// Both tabs own child routes (/home/guides, /settings/security) and stay lit
	// while you are inside them, so these are prefix matches rather than equality.
	const isHome = $derived(routeId?.startsWith('/(auth-required)/(app)/home') ?? false);
	// Admin and debug are reached from Settings and have no tab of their own,
	// so Settings stays lit inside them rather than the nav showing no tab at all.
	const isSettings = $derived(
		[
			'/(auth-required)/(app)/settings',
			'/(auth-required)/(app)/admin',
			'/(auth-required)/(app)/debug'
		].some((prefix) => routeId?.startsWith(prefix) ?? false)
	);
	// A prefix match, like isHome and isSettings above. The partner page has no
	// child routes since messages, tasks and rewards moved to pages of their
	// own that follow the context (/messages, /tasks, /rewards), which light
	// no tab until the nav is rebuilt around them.
	const isPartner = $derived(
		(id: string) =>
			(routeId?.startsWith('/(auth-required)/(app)/partner/[id]') ?? false) && page.params.id === id
	);
</script>

<nav aria-label="Primary">
	<div class="tabs">
		<a href={homeHref} aria-current={isHome ? 'page' : undefined}>
			<wa-icon name="house" variant="solid"></wa-icon>
			<span>Home</span>
		</a>

		{#each partners as partner (partner.id)}
			{const href = $derived(resolve('/(auth-required)/(app)/partner/[id]', { id: partner.id }))}
			<a {href} aria-current={isPartner(partner.id) ? 'page' : undefined}>
				<!-- `image` is left off entirely when null: wa-avatar falls back to
				     initials, and an empty image="" would render a broken image. -->
				<wa-avatar
					image={partner.image ?? undefined}
					initials={initialsFor(partnerName(partner.names))}
					label={partnerName(partner.names)}
				></wa-avatar>
				<span>{partnerName(partner.names)}</span>
			</a>
		{/each}

		<a href={settingsHref} aria-current={isSettings ? 'page' : undefined}>
			<wa-icon name="gear" variant="solid"></wa-icon>
			<span>Settings</span>
		</a>
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
		   the right-hand one: a column of its own, so it never covers a tab
		   however many partners there are. The left column only balances it. */
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
			   tabs bunch in the middle; a long partner name still ellipsises. */
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

			/* One box for an icon and an avatar alike, so every label sits on
			   the same line: the avatar is taller than an icon, and pushed its
			   name a couple of pixels below the others. */
			wa-icon,
			wa-avatar {
				block-size: 1.75rem;
				display: flex;
				align-items: center;
				justify-content: center;
			}

			wa-icon {
				font-size: 1.5rem;
			}

			wa-avatar {
				--size: 1.75rem;
			}

			&[aria-current='page'] wa-avatar {
				/* The amber label alone is easy to miss next to a photo, so the
				   active partner also gets a ring. */
				outline: 2px solid currentColor;
				outline-offset: -2px;
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
