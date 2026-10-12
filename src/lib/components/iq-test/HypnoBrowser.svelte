<script lang="ts">
	import {
		formatDuration,
		HYPNO_CATEGORIES,
		type HypnoCategory,
		type HypnoFile
	} from '$lib/playroom/iq-test/hypno';
	import type { HypnoSession } from '$lib/playroom/iq-test/hypno-session.svelte';
	import { tryFetch } from '$lib/request-failure.svelte';

	/**
	 * Choosing a hypno: search, categories, a trigger, a length, and the results.
	 * Shown in the hypno tab's panel, behind its "Select" button.
	 *
	 * Choosing one plays it and leaves the list open, so another can be tried
	 * straight after; the one playing is marked rather than offered again.
	 *
	 * The categories, trigger and length here are the session's filter, so they
	 * are also what Next and the automatic next-after-the-end draw from — this is
	 * where "random" is narrowed. The categories are remembered on the device
	 * (`oncategories`); the rest last for the visit.
	 */
	let {
		session,
		oncategories
	}: {
		session: HypnoSession;
		/** The categories changed: the page remembers them, per tier. */
		oncategories: (categories: HypnoCategory[]) => void;
	} = $props();

	const LENGTHS = [
		{ minutes: null, label: 'Any length' },
		{ minutes: 10, label: 'Up to 10 min' },
		{ minutes: 30, label: 'Up to 30 min' }
	] as const;

	let results = $state<HypnoFile[]>([]);
	let total = $state(0);
	let triggers = $state<{ name: string; count: number }[]>([]);
	let counts = $state<Record<string, number>>({});
	let failed = $state(false);
	let loading = $state(false);

	/** The search box's text, read from the element (see AGENTS.md on shadow roots). */
	// svelte-ignore state_referenced_locally
	let queryText = $state(session.filter.query);

	const filterKey = $derived(
		JSON.stringify([
			session.filter.categories,
			session.filter.trigger,
			session.filter.maxMinutes,
			queryText
		])
	);

	// Search whenever the filter changes, debounced so typing does not send a
	// request per keystroke. Only while shown: the panel mounts this when it
	// opens, and unmounting it cancels a search in flight.
	$effect(() => {
		void filterKey;
		const controller = new AbortController();
		const timer = setTimeout(() => void search(controller.signal), 250);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	async function search(signal: AbortSignal) {
		session.filter.query = queryText;
		loading = true;
		type Answer = {
			files: HypnoFile[];
			total: number;
			triggers: { name: string; count: number }[];
			categories: { id: string; count: number }[];
		};
		let body: Answer | null;
		// The body read is guarded with the fetch: closing the panel aborts the
		// search, and an abort part-way through `json()` throws from there.
		try {
			const response = await tryFetch(session.query({ limit: '30' }), {
				signal
			});
			body = response?.ok ? ((await response.json()) as Answer) : null;
		} catch {
			return;
		}
		loading = false;
		if (body === null) {
			failed = true;
			return;
		}
		failed = false;
		({ files: results, total, triggers } = body);
		counts = Object.fromEntries(body.categories.map((category) => [category.id, category.count]));
	}

	function toggleCategory(id: HypnoCategory) {
		const current = session.filter.categories;
		const next = current.includes(id)
			? current.filter((category) => category !== id)
			: [...current, id];
		session.filter.categories = next;
		oncategories(next);
	}

	function searchBox(node: HTMLElement & { value?: string | null }) {
		const update = () => {
			queryText = node.value ?? '';
		};
		node.addEventListener('input', update);
		return () => node.removeEventListener('input', update);
	}

	function choose(file: HypnoFile) {
		session.play(file);
	}
</script>

<div class="hypno-browser">
	<div class="search">
		<wa-input
			{@attach searchBox}
			label="Search"
			placeholder="Name, creator, trigger…"
			value={queryText}
			with-clear
		></wa-input>
	</div>

	<!-- bambicloud's file types; PMVHaven has none, only tags (under "Tags"). -->
	{#if session.source === 'bambicloud'}
	<fieldset class="chips">
		<legend>Categories</legend>
		{#each HYPNO_CATEGORIES as category (category.id)}
			<!-- Native checkboxes styled as chips: each is a plain on/off choice. -->
			<label class="chip" class:on={session.filter.categories.includes(category.id)}>
				<input
					type="checkbox"
					checked={session.filter.categories.includes(category.id)}
					onchange={() => toggleCategory(category.id)}
				/>
				{category.label}
				{#if counts[category.id] !== undefined}<span class="count">{counts[category.id]}</span>{/if}
			</label>
		{/each}
	</fieldset>
	{/if}

	{#if triggers.length > 0}
		<fieldset class="chips">
			<legend>{session.source === 'pmvhaven' ? 'Tags' : 'Trigger'}</legend>
			{#each triggers as trigger (trigger.name)}
				<label class="chip" class:on={session.filter.trigger === trigger.name}>
					<input
						type="radio"
						name="hypno-trigger"
						checked={session.filter.trigger === trigger.name}
						onclick={() => {
							session.filter.trigger = session.filter.trigger === trigger.name ? null : trigger.name;
						}}
					/>
					{trigger.name}
				</label>
			{/each}
		</fieldset>
	{/if}

	<fieldset class="chips">
		<legend>Length</legend>
		{#each LENGTHS as length (length.label)}
			<label class="chip" class:on={session.filter.maxMinutes === length.minutes}>
				<input
					type="radio"
					name="hypno-length"
					checked={session.filter.maxMinutes === length.minutes}
					onchange={() => {
						session.filter.maxMinutes = length.minutes;
					}}
				/>
				{length.label}
			</label>
		{/each}
	</fieldset>

	<div class="random">
		<span class="total" aria-live="polite">
			{#if loading}Searching…{:else}{total} matching{/if}
		</span>
		<wa-button
			size="s"
			variant="brand"
			disabled={total === 0}
			onclick={() => {
				void session.next();
			}}
		>
			<wa-icon slot="start" name="shuffle" variant="solid"></wa-icon>
			Random from these
		</wa-button>
	</div>

	{#if failed}
		<p class="failed">Couldn't load hypnos. Check your connection and try again.</p>
	{:else}
		<ul class="results" data-testid="hypno-results">
			{#each results as file (file.uuid)}
				<li>
					<div class="details">
						<!-- To the file's own page, for credit and for whatever the page says about it. -->
						<a class="name" href={file.pageUrl} target="_blank" rel="noopener noreferrer">
							{file.name}
						</a>
						<span class="meta">
							{file.author} · {formatDuration(file.durationMs)} · {file.fileType}
						</span>
						{#if file.triggers.length > 0}
							<span class="triggers">{file.triggers.slice(0, 5).join(', ')}</span>
						{/if}
						{#each file.warnings as warning, index (index)}
							<span class="warning">⚠ {warning}</span>
						{/each}
					</div>
					{#if session.current?.uuid === file.uuid}
						<span class="playing" data-testid="hypno-playing">
							<wa-icon name="volume-high" variant="solid"></wa-icon>
							Playing
						</span>
					{:else}
						<wa-button size="s" appearance="outlined" onclick={() => choose(file)}>
							Play <span class="wa-visually-hidden">{file.name}</span>
						</wa-button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.playing {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		flex: none;
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--wa-color-brand-on-quiet);
	}

	.hypno-browser {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.chips {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;

		legend {
			font-weight: 700;
			margin-block-end: 0.375rem;
			padding: 0;
		}
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.625rem;
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-radius: 999px;
		font-size: 0.875rem;
		cursor: pointer;

		input {
			position: absolute;
			opacity: 0;
			pointer-events: none;
		}

		&.on {
			border-color: var(--wa-color-brand-border-loud);
			background: var(--wa-color-brand-fill-quiet);
		}

		&:has(input:focus-visible) {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}

		.count {
			color: var(--wa-color-text-quiet);
			font-size: 0.75rem;
		}
	}

	.random {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;

		.total {
			color: var(--wa-color-text-quiet);
			font-size: 0.875rem;
		}
	}

	.results {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;

		li {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			padding: 0.625rem 0;
			border-block-end: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		}

		.details {
			flex: 1;
			display: flex;
			flex-direction: column;
			min-inline-size: 0;
		}

		.name {
			font-weight: 600;
			color: inherit;
			text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
			text-underline-offset: 0.15em;

			&:hover {
				text-decoration-color: currentColor;
			}
		}

		.meta,
		.triggers {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}

		.warning {
			font-size: 0.8125rem;
			color: var(--wa-color-warning-on-quiet);
		}
	}

	.failed {
		color: var(--wa-color-text-danger);
	}
</style>
