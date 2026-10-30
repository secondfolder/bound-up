<script lang="ts">
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import type { DreamElement } from '$lib/dream/elements';
	import DreamElementForm from './DreamElementForm.svelte';
	import { elementIcon } from './element-icons';

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
		ondraw,
		onrename,
		onedit,
		dreamId = '',
		onclose
	}: {
		element: DreamElement;
		filling: boolean;
		/** Saves a changed element, on the setup page (docs/dreams.md, "Changing what was made"). */
		onedit?: (changed: DreamElement) => Promise<boolean>;
		/** The daydream, which keys the changes' draft. */
		dreamId?: string;
		/** Names drawn for this element's description, or null when none could be. */
		ondraw?: () => Promise<{ given: string[]; family: string[] } | null>;
		onrename?: (name: string) => Promise<void>;
		onclose: () => void;
	} = $props();

	let drawn = $state<{ given: string[]; family: string[] } | null>(null);
	let editing = $state(false);
	let drawing = $state(false);
	/** A person keeps a family name in the new one when they had one. */
	const keepsFamily = $derived(element.name.includes(' '));

	async function another() {
		drawing = true;
		drawn = (await ondraw?.()) ?? null;
		drawing = false;
	}

	function nameFrom(given: string, index: number): string {
		return keepsFamily
			? `${given} ${drawn?.family[index % (drawn?.family.length || 1)] ?? ''}`.trim()
			: given;
	}

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
	{#if editing && onedit}
		<DreamElementForm
			{element}
			{dreamId}
			onsave={async (changed) => {
				const saved = await onedit(changed);
				if (saved) {
					editing = false;
				}
				return saved;
			}}
			oncancel={() => {
				editing = false;
			}}
		/>
	{:else}
	<div class="card">
		<p class="type">
			<wa-icon name={elementIcon(element.type)} aria-hidden="true"></wa-icon>
			{heading(element.type)}{element.also.length > 0 ? ` · also ${element.also.join(', ')}` : ''}
		</p>
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
		{#if ondraw && (element.type === 'character' || element.nameFrom)}
			<section class="names">
				{#if drawn}
					<h3>Another name</h3>
					<div class="choices">
						{#each drawn.given as given, index (given)}
							{const name = $derived(nameFrom(given, index))}
							<wa-button
								size="s"
								appearance="outlined"
								onclick={async () => {
									await onrename?.(name);
									drawn = null;
								}}>{name}</wa-button
							>
						{/each}
					</div>
				{:else}
					<wa-button size="s" appearance="plain" disabled={drawing} onclick={another}>Another name</wa-button>
				{/if}
			</section>
		{/if}
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
		{#if onedit}
			<div class="change">
				<wa-button
					appearance="outlined"
					onclick={() => {
						editing = true;
					}}
				>
					<wa-icon slot="start" name="pen" aria-hidden="true"></wa-icon>
					Change
				</wa-button>
			</div>
		{/if}
	</div>
	{/if}
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

	.change {
		display: flex;
		justify-content: flex-end;
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-2xs);
	}

	.loading {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
	}
</style>
