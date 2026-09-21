<script lang="ts">
	import { PRF_PROVIDERS } from '$lib/passkey-providers';

	/**
	 * Where to put a passkey so it can unlock messages.
	 *
	 * Shown wherever someone has just found out their own passkey cannot: after
	 * a failed enrolment, and on the unlock screen when every passkey on the
	 * account has been tried and failed. The same list in both places, from
	 * `PRF_PROVIDERS`, so the two cannot drift.
	 *
	 * Collapsed by default. It is a wall of vendor names, and someone who has
	 * just been told their password manager is the problem usually wants the
	 * sentence, not the table — but the people who do want it really want it.
	 */
	let { open = false }: { open?: boolean } = $props();

	const groups = [
		{ prf: 'full' as const, title: 'These work' },
		{ prf: 'partial' as const, title: 'These sometimes work' },
		{ prf: 'none' as const, title: 'These do not' }
	];
</script>

<details class="providers" {open}>
	<summary>Which password managers can unlock messages</summary>
	{#each groups as group (group.prf)}
		<h4>{group.title}</h4>
		<ul>
			{#each PRF_PROVIDERS.filter((provider) => provider.prf === group.prf) as provider (provider.name)}
				<li>
					<strong>{provider.name}</strong>
					{#if provider.note}<span class="note">{provider.note}</span>{/if}
				</li>
			{/each}
		</ul>
	{/each}
	<p class="note">
		Surveyed September 2026. Support changes, so a manager listed here as partial may work on your
		device. The only way to know is to add a passkey and see what this page says.
	</p>
</details>

<style>
	.providers {
		display: block;
		/* The prose above this always ends mid-thought ("…somewhere that
		   supports it."), and a summary butted straight against it read as part
		   of the same sentence. */
		margin-block-start: 0.75rem;
		font-size: 0.8125rem;

		summary {
			cursor: pointer;
			color: var(--wa-color-text-quiet);
		}

		h4 {
			margin: 0.75rem 0 0.25rem;
			font-size: 0.8125rem;
		}

		ul {
			margin: 0;
			padding-left: 1.1rem;
		}

		li {
			margin-bottom: 0.15rem;
		}

		.note {
			display: block;
			color: var(--wa-color-text-quiet);
		}

		p.note {
			margin: 0.75rem 0 0;
		}
	}
</style>
