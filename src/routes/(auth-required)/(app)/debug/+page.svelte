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
		description="For working out how the app behaves, not for using it."
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

		ul {
			padding: 0 var(--page-gutter);
			margin: 0;

			li {
				list-style-type: none;
				border-bottom: 1px solid var(--wa-color-surface-border);

				a {
					display: flex;
					align-items: center;
					gap: 0.75rem;
					padding: 0.875rem 0;
					text-decoration: none;
					color: inherit;
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
