<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = resolve('/(auth-required)/(app)/settings');

	/** One line per part of the server, in the order the settings page has them. */
	const parts = $derived([
		{ name: 'Email', ready: data.status.mailProblem === null },
		{ name: 'Language models', ready: data.status.languageModels },
		{ name: 'Image models', ready: data.status.imageModels },
		{ name: 'Notifications', ready: data.status.push }
	]);
</script>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to settings"
		backText="Settings"
		title="Admin"
		description="How this server runs, and who can do what on it."
	/>

	<div class="content">
		{#if data.status.mailProblem}
			<!-- The one part a server cannot do without: nobody can confirm a new
			     account until it works, so it is said here and not only on the
			     settings page. -->
			<wa-callout variant="warning" size="s" data-testid="mail-warning">
				<wa-icon slot="icon" name="envelope" variant="solid"></wa-icon>
				Email isn't set up, so nobody who signs up can confirm their address.
				<a href={resolve('/(auth-required)/(app)/admin/server')}>Set it up</a>
			</wa-callout>
		{/if}

		<ul>
			<li>
				<a href={resolve('/(auth-required)/(app)/admin/server')}>
					<span class="what">
						<span>Server settings</span>
						<small class="parts">
							{#each parts as part (part.name)}
								<span class:off={!part.ready}>
									<wa-icon
										name={part.ready ? 'circle-check' : 'circle-minus'}
										variant="solid"
										label={part.ready ? 'set up' : 'not set up'}
									></wa-icon>
									{part.name}
								</span>
							{/each}
						</small>
					</span>
					<wa-icon name="chevron-right" variant="solid"></wa-icon>
				</a>
			</li>
			<li>
				<a href={resolve('/(auth-required)/(app)/admin/users')}>
					<span class="what">
						<span>Accounts</span>
						<small>Give an account features or admin access.</small>
					</span>
					<wa-icon name="chevron-right" variant="solid"></wa-icon>
				</a>
			</li>
		</ul>
	</div>
</section>

<style>
	section {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		width: 100%;
		padding-bottom: var(--wa-space-l);

		.content {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			padding: var(--wa-space-l) var(--page-gutter);
		}

		ul {
			padding: 0;
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

		.parts {
			display: flex;
			flex-wrap: wrap;
			gap: 0.25rem 0.875rem;

			span {
				display: inline-flex;
				align-items: center;
				gap: 0.3rem;
				color: var(--wa-color-success-on-quiet);
			}

			.off {
				color: var(--wa-color-text-quiet);
			}
		}
	}
</style>
