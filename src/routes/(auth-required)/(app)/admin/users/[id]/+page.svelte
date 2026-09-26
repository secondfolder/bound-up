<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = resolve('/(auth-required)/(app)/admin');

	// svelte-ignore state_referenced_locally
	// Both capture the load's initial forms on purpose: `superForm` registers
	// its lifecycle once, and re-running it on every `invalidate()` would reset
	// it. The account itself is read from `data`, which a successful action
	// refreshes through superforms' default `invalidateAll`.
	const featureForm = superForm(data.featureForm);
	// svelte-ignore state_referenced_locally
	const roleForm = superForm(data.roleForm);
	const { submitting: featureSubmitting, errors: featureErrors } = featureForm;
	const { submitting: roleSubmitting, errors: roleErrors } = roleForm;

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to admin"
		backText="Admin"
		title={data.account.name}
		description={data.account.email}
	/>

	<div class="content">
		<div class="panel">
			<h2>Features</h2>
			<!-- One form for the list: each row's button carries its feature as the
			     submitter's name/value, and its formaction says grant or revoke. -->
			<form method="POST" use:featureForm.enhance>
				<ul>
					{#each data.account.features as feature (feature.key)}
						<li>
							<span class="feature">
								<span class="name">{feature.name}</span>
								<small>{feature.description}</small>
								{#if feature.held}
									<small class="held">
										{feature.held.source === 'purchase' ? 'Purchased' : 'Granted'}
										{dateFormat.format(feature.held.grantedAt)}
										{#if feature.held.grantedByName}by {feature.held.grantedByName}{/if}
									</small>
								{/if}
							</span>
							{#if feature.held}
								<wa-button
									type="submit"
									name="feature"
									value={feature.key}
									formaction="?/revokeFeature"
									appearance="outlined"
									variant="danger"
									size="s"
									disabled={$featureSubmitting}
								>
									Revoke {feature.name}
								</wa-button>
							{:else}
								<wa-button
									type="submit"
									name="feature"
									value={feature.key}
									formaction="?/grantFeature"
									appearance="outlined"
									variant="brand"
									size="s"
									disabled={$featureSubmitting}
								>
									Grant {feature.name}
								</wa-button>
							{/if}
						</li>
					{/each}
				</ul>
				{#if $featureErrors._errors}<span class="invalid">{$featureErrors._errors}</span>{/if}
			</form>
		</div>

		<div class="panel">
			<h2>Admin access</h2>
			<p>
				{#if data.account.isAdmin}
					This account is an admin: it can open this page and give features and admin access to
					any account.
				{:else}
					This account is not an admin.
				{/if}
			</p>
			<form method="POST" action="?/setRole" use:roleForm.enhance>
				{#if data.account.isAdmin}
					<!-- Hidden for your own account rather than disabled: the server
					     refuses it either way, and a button that can never work is noise. -->
					{#if !data.isSelf}
						<wa-button
							type="submit"
							name="role"
							value="user"
							appearance="outlined"
							variant="danger"
							disabled={$roleSubmitting}
						>
							Remove admin access
						</wa-button>
					{/if}
				{:else}
					<wa-button
						type="submit"
						name="role"
						value="admin"
						appearance="outlined"
						disabled={$roleSubmitting}
					>
						Make admin
					</wa-button>
				{/if}
				{#if $roleErrors._errors}<span class="invalid">{$roleErrors._errors}</span>{/if}
			</form>
		</div>
	</div>
</section>

<style>
	section {
		max-width: 40rem;
		margin: 0 auto;
		width: 100%;
		padding-bottom: var(--wa-space-l);

		.content {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			padding: var(--wa-space-l);
		}

		.panel {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			padding: 1rem;
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-l);
			background: var(--wa-color-surface-raised);

			h2,
			p {
				margin: 0;
			}

			p {
				color: var(--wa-color-text-quiet);
			}
		}

		ul {
			padding: 0;
			margin: 0;

			li {
				list-style-type: none;
				display: flex;
				align-items: center;
				gap: 1rem;
				padding: 0.5rem 0;

				& + li {
					border-top: 1px solid var(--wa-color-surface-border);
				}
			}
		}

		.feature {
			display: flex;
			flex-direction: column;
			flex: 1 1 auto;
			min-width: 0;

			.name {
				font-weight: var(--wa-font-weight-semibold, 600);
			}

			small {
				color: var(--wa-color-text-quiet);
			}
		}

		.invalid {
			color: var(--wa-color-text-danger);
		}
	}
</style>
