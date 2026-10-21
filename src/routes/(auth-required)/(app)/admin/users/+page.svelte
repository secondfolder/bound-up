<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = resolve('/(auth-required)/(app)/admin');
</script>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to admin"
		backText="Admin"
		title="Accounts"
		description="Find an account to give it features or admin access."
	/>

	<div class="content">
		<!-- A plain GET form, not a superform: searching is navigation, and the
		     query belongs in the URL. SvelteKit handles it client-side. -->
		<search>
			<form method="GET">
				<wa-input
					name="q"
					type="search"
					label="Email or name"
					value={data.query}
					autocomplete="off"
				></wa-input>
				<wa-button type="submit" appearance="outlined">Search</wa-button>
			</form>
		</search>

		<h2>{data.query ? 'Matching accounts' : 'Newest accounts'}</h2>
		{#if data.users.length === 0}
			<p class="empty">No accounts match “{data.query}”.</p>
		{:else}
			<ul>
				{#each data.users as account (account.id)}
					<li>
						<a href={resolve('/(auth-required)/(app)/admin/users/[id]', { id: account.id })}>
							<!-- The name first, as a person reads the list; the address under
							     it, which is what tells two Adas apart. -->
							<span class="who">
								<span class="name">{account.name}</span>
								<small class="email">{account.email}</small>
							</span>
							<!-- Outlined: solid amber is what a save button says. -->
							{#if account.isAdmin}<wa-badge variant="brand" appearance="outlined">Admin</wa-badge>{/if}
							<wa-icon name="chevron-right" variant="solid"></wa-icon>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
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

		form {
			display: flex;
			align-items: end;
			gap: 0.5rem;

			wa-input {
				flex: 1 1 auto;
			}
		}

		/* The size every settings subsection heading uses. */
		h2 {
			margin: 0;
			font-size: var(--wa-font-size-l);
		}

		.empty {
			margin: 0;
			color: var(--wa-color-text-quiet);
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
					padding: 0.75rem 0;
					text-decoration: none;
					color: inherit;
				}
			}
		}

		.who {
			display: flex;
			flex-direction: column;
			flex: 1 1 auto;
			min-width: 0;

			/* break-word, not anywhere: it breaks at the address's hyphens and
			   dots first, where anywhere split "example.te / st". */
			.email {
				overflow-wrap: break-word;
			}

			small {
				color: var(--wa-color-text-quiet);
			}
		}

		wa-badge {
			flex: none;
		}
	}
</style>
