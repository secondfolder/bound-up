<script lang="ts">
	import { resolve } from '$app/paths';
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import RadioButton from '$lib/components/segmented/RadioButton.svelte';
	import RadioButtonGroup from '$lib/components/segmented/RadioButtonGroup.svelte';
	import { superForm } from '$lib/superform';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = resolve('/(auth-required)/(app)/debug');
	const here = resolve('/(auth-required)/(app)/debug/dreams');

	// svelte-ignore state_referenced_locally
	// Captured once on purpose: superForm's stores are the live connection, and
	// each vote redirects to a fresh load that hands over a new pair id.
	const voteForm = superForm(data.form, { resetForm: true, invalidateAll: true });
	const { form, enhance, submitting } = voteForm;

	function compareHref(a: string, b: string): string {
		return `${here}?${new URLSearchParams({ a, b })}`;
	}
</script>

<svelte:head>
	<title>Bench votes · Bound Up</title>
</svelte:head>

<section>
	<NestedPageHeader {backHref} backLabel="Back to debug tools" backText="Debug" title="Bench votes" />

	{#if data.labels.length < 2}
		<p class="empty">
			Two prompt versions are needed to compare. Run <code>npm run dreams:bench</code> at two commits
			(or with two <code>--label</code>s), then come back.
		</p>
	{:else}
		<p class="versions">
			Comparing <strong>{data.a}</strong> and <strong>{data.b}</strong>, blind. Others:
			{#each data.labels.filter((label) => label !== data.a && label !== data.b) as label (label)}
				<a href={compareHref(label, data.b ?? '')}>{label}</a>
			{/each}
		</p>

		{#if data.pair}
			<p class="brief">Brief: “{data.pair.brief}”</p>
			<div class="pair">
				{#each [{ name: 'Left', side: data.pair.left }, { name: 'Right', side: data.pair.right }] as { name, side } (name)}
					<article>
						<h2>{name}: {side.title}</h2>
						<wa-details summary="Telling notes"><p>{side.telling}</p></wa-details>
						{#each side.passages as passage, index (index)}
							<div class="passage">
								{#each passage.split(/\n{2,}/) as paragraph, at (at)}
									<p>{paragraph}</p>
								{/each}
							</div>
						{/each}
					</article>
				{/each}
			</div>

			<form method="POST" use:enhance>
				<input type="hidden" name="pair" value={$form.pair} />
				<RadioButtonGroup label="Which is better?" name="choice" bind:value={$form.choice}>
					<RadioButton value="left">Left</RadioButton>
					<RadioButton value="tie">Tie</RadioButton>
					<RadioButton value="right">Right</RadioButton>
				</RadioButtonGroup>
				<div class="tags">
					<CheckboxField superform={voteForm} field="samey" title="Samey" />
					<CheckboxField superform={voteForm} field="offBrief" title="Off brief" />
					<CheckboxField superform={voteForm} field="tooMuchMarkup" title="Too much markup" />
					<CheckboxField superform={voteForm} field="flat" title="Flat" />
					<CheckboxField superform={voteForm} field="loved" title="Loved it" />
				</div>
				<wa-button type="submit" variant="brand" disabled={$submitting}>Vote, then next</wa-button>
			</form>
		{:else}
			<p class="empty">These two versions have no brief in common to compare.</p>
		{/if}
	{/if}

	{#if data.standings.length > 0}
		<h2>Leaderboard</h2>
		<p class="note">From {data.voteCount} votes. Higher strength is better; one version at 2 beats one at 1 about two times in three.</p>
		<table>
			<thead><tr><th>Version</th><th>Strength</th><th>Won</th><th>Lost</th><th>Tied</th></tr></thead>
			<tbody>
				{#each data.standings as standing (standing.label)}
					<tr>
						<td>{standing.label}</td>
						<td>{standing.strength.toFixed(2)}</td>
						<td>{standing.wins}</td>
						<td>{standing.losses}</td>
						<td>{standing.ties}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	section {
		max-width: var(--page-width-wide);
		margin: 0 auto;
		width: 100%;
		padding: 0 var(--page-gutter) var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
		gap: var(--wa-space-l);
	}

	article {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
		min-width: 0;

		h2 {
			font-size: var(--wa-font-size-l);
			margin: 0;
		}
	}

	.passage {
		border-top: 1px solid var(--wa-color-surface-border);
		padding-top: var(--wa-space-s);

		p {
			margin: 0 0 var(--wa-space-s);
			white-space: pre-line;
		}
	}

	form {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--wa-space-m);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-m);
	}

	.brief,
	.note,
	.versions {
		color: var(--wa-color-text-quiet);
		margin: 0;
	}

	.versions a {
		margin-inline-start: var(--wa-space-2xs);
	}

	table {
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;

		th,
		td {
			text-align: start;
			padding: var(--wa-space-2xs) var(--wa-space-s);
			border-bottom: 1px solid var(--wa-color-surface-border);
		}
	}
</style>
