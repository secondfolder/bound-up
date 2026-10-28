<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';

	const backHref = resolve('/(auth-required)/(app)/settings');
</script>

<svelte:head>
	<title>Debug tools · Bound Up</title>
</svelte:head>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to settings"
		backText="Settings"
		title="Debug tools"
	/>

	<ul>
		<li>
			<a href={resolve('/(auth-required)/(app)/debug/prompts')}>
				<span class="what">
					<span>Daydream prompts</span>
					<small>Every prompt the daydream models are sent: browse, compare and review them.</small>
				</span>
				<wa-icon name="chevron-right" variant="solid"></wa-icon>
			</a>
		</li>
	</ul>
</section>

<style>
	section {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		width: 100%;
		padding-bottom: var(--wa-space-l);

		/* The same space under the header as the admin and settings pages give
		   their lists; flush, the first row touched the divider. */
		ul {
			padding: var(--wa-space-l) var(--page-gutter) 0;
			margin: 0;

			li {
				list-style-type: none;
				border-bottom: 1px solid var(--wa-color-surface-border);

				/* The settings list's row: padded and pulled back out, so the
				   hover wash has room while the text keeps the page's edge. */
				a {
					display: flex;
					align-items: center;
					gap: 0.75rem;
					padding: 0.875rem 0.5rem;
					margin-inline: -0.5rem;
					border-radius: var(--wa-border-radius-m);
					text-decoration: none;
					color: inherit;

					&:hover,
					&:focus-visible {
						background: var(--wa-color-surface-raised);
					}

					@media (prefers-reduced-motion: no-preference) {
						transition: background-color var(--wa-transition-fast);

						> wa-icon {
							transition: translate var(--wa-transition-fast);
						}

						&:hover > wa-icon {
							translate: 2px 0;
						}
					}
				}
			}
		}

		.what {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			flex: 1 1 auto;
			min-width: 0;

			small {
				color: var(--wa-color-text-quiet);
			}
		}
	}
</style>
