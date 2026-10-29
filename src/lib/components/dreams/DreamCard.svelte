<script lang="ts">
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import type { DreamElement } from '$lib/dream/elements';

	/**
	 * An element's card (docs/dreams.md, "Detail on tap"): what the story
	 * keeps about a person or thing. A card that is still only a name is
	 * filled in as it opens. Fields marked not to show are under "Behind the
	 * scenes", a spoiler the user chooses to open, never a secret kept from
	 * them.
	 */
	let {
		element,
		filling,
		onclose
	}: {
		element: DreamElement;
		filling: boolean;
		onclose: () => void;
	} = $props();

	const shown = $derived(element.fields.filter((field) => field.shown && field.name !== 'seed'));
	const seed = $derived(element.fields.find((field) => field.name === 'seed')?.text ?? '');
	const hidden = $derived(element.fields.filter((field) => !field.shown));

	/** A field's tag as a heading: `with-you` reads "With you". */
	function heading(name: string): string {
		const words = name.replaceAll('-', ' ');
		return words.charAt(0).toUpperCase() + words.slice(1);
	}

	function percent(value: number, max: number | undefined): number {
		return Math.round((value / (max ?? 100)) * 100);
	}
</script>

<ResponsiveDialog label={element.name} {onclose}>
	<div class="card">
		<p class="type">{heading(element.type)}{element.also.length > 0 ? ` · also ${element.also.join(', ')}` : ''}</p>
		{#if shown.length === 0 && seed}
			<p class="seed">{seed}</p>
		{/if}
		{#if filling}
			<div class="loading" role="status" aria-label="Filling in this card">
				<wa-skeleton effect="sheen"></wa-skeleton>
				<wa-skeleton effect="sheen"></wa-skeleton>
				<wa-skeleton effect="sheen"></wa-skeleton>
			</div>
		{/if}
		{#each shown as field (field.name)}
			<section>
				<h3>{heading(field.name)}</h3>
				<p>{field.text}</p>
			</section>
		{/each}
		{#each element.stats as stat (stat.name)}
			<section class="stat">
				<h3>{heading(stat.name)}</h3>
				{#if stat.kind === 'meter' && typeof stat.value === 'number'}
					<wa-progress-bar value={percent(stat.value, stat.max)} label={heading(stat.name)}
						>{stat.value} / {stat.max ?? 100}</wa-progress-bar
					>
				{:else if Array.isArray(stat.value)}
					<ul>
						{#each stat.value as item, index (index)}<li>{item}</li>{/each}
					</ul>
				{:else}
					<p>{stat.value}</p>
				{/if}
			</section>
		{/each}
		{#if hidden.length > 0}
			<wa-details summary="Behind the scenes">
				{#each hidden as field (field.name)}
					<section>
						<h3>{heading(field.name)}</h3>
						<p>{field.text}</p>
					</section>
				{/each}
			</wa-details>
		{/if}
	</div>
</ResponsiveDialog>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);

		p {
			margin: 0;
			white-space: pre-line;
		}

		h3 {
			margin: 0 0 var(--wa-space-2xs);
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}

		ul {
			margin: 0;
		}
	}

	.type,
	.seed {
		color: var(--wa-color-text-quiet);
	}

	.loading {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
	}
</style>
