<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		AXIS_PARAM,
		type Catalogue,
		type Combo,
		comboParams,
		describeCombo,
		LINT_RULE_LABELS,
		type PromptView,
		readReviewed,
		writeReviewed
	} from '$lib/prompt-review';
	import { reportRequestFailure, tryFetch } from '$lib/request-failure.svelte';
	import { onChoose } from './choose';
	import ParagraphList from './ParagraphList.svelte';
	import PromptDiff from './PromptDiff.svelte';
	import PromptDisplay from './PromptDisplay.svelte';

	/**
	 * The prompt review for one builder (docs/prompt-review.md, "The debug
	 * page"). Mounted afresh for each builder, so everything here starts from
	 * that builder's baseline and from what the URL says.
	 *
	 * What is being looked at lives in the URL — the view, the text source and
	 * every option that differs from the baseline — so any prompt can be
	 * linked to. Each prompt is rendered by /api/debug/prompts as it is chosen;
	 * the paragraphs and lint come from the committed catalogue.
	 */
	let {
		catalogue,
		starters,
		initial
	}: {
		catalogue: Catalogue;
		starters: readonly string[];
		/** The page's query when it opened. */
		initial: URLSearchParams;
	} = $props();

	type View = 'explore' | 'compare' | 'sweep' | 'paragraphs' | 'lint';
	const VIEWS: { id: View; label: string }[] = [
		{ id: 'explore', label: 'Explore' },
		{ id: 'compare', label: 'Compare' },
		{ id: 'sweep', label: 'Sweep' },
		{ id: 'paragraphs', label: 'Paragraphs' },
		{ id: 'lint', label: 'Lint' }
	];

	// Read once: from here on this component owns the state, and writes it back to the URL.
	// svelte-ignore state_referenced_locally
	const { axes } = catalogue.builder;
	// svelte-ignore state_referenced_locally
	const startingView = initial.get('view');
	let view = $state<View>(
		VIEWS.some(({ id }) => id === startingView) ? (startingView as View) : 'explore'
	);
	// svelte-ignore state_referenced_locally
	let source = $state(initial.get('text') ?? 'placeholders');
	let combo = $state<Combo>(
		Object.fromEntries(
			axes.map((axis) => {
				// svelte-ignore state_referenced_locally
				const value = initial.get(`${AXIS_PARAM}${axis.id}`);
				return [
					axis.id,
					value && axis.values.some((option) => option.id === value) ? value : axis.baseline
				];
			})
		)
	);
	let sweepAxis = $state(axes[0]?.id ?? '');

	let current = $state<PromptView | null>(null);
	/** The current prompt when it rendered, for the views that need one. */
	const rendered = $derived(current?.ok ? current : null);
	let pinned = $state<Extract<PromptView, { ok: true }> | null>(null);
	let swept = $state<(PromptView & { value: string })[]>([]);
	let reviewed = $state<Set<string>>(new Set());
	let copied = $state(false);

	$effect(() => {
		reviewed = readReviewed();
	});

	function toggleReviewed(id: string) {
		const next = new Set(reviewed);
		if (!next.delete(id)) {
			next.add(id);
		}
		reviewed = next;
		writeReviewed(next);
	}

	const query = $derived(
		new URLSearchParams([
			['builder', catalogue.builder.id],
			...(source === 'placeholders' ? [] : [['text', source]]),
			...comboParams(axes, combo)
		]).toString()
	);

	// The URL follows what is shown, without a navigation: nothing the load
	// returns depends on anything but the builder.
	$effect(() => {
		const search = new URLSearchParams(query);
		if (view !== 'explore') {
			search.set('view', view);
		}
		// Not before anything has changed: on a full page load this runs before
		// SvelteKit's router has started, and `replaceState` throws until it has.
		if (`?${search}` === location.search) {
			return;
		}
		// A runtime query on a resolved route: every parameter is read back
		// through `comboFrom`, which ignores anything it does not know.
		// biome-ignore lint/plugin: see above — a resolved route plus a validated query.
		replaceState(`${resolve('/(auth-required)/(app)/debug/prompts')}?${search}`, {});
	});

	async function fetchView(extra = ''): Promise<unknown> {
		const response = await tryFetch(`/api/debug/prompts?${query}${extra}`);
		if (!response?.ok) {
			reportRequestFailure(response);
			return null;
		}
		return response.json();
	}

	$effect(() => {
		// Read here so the effect re-runs when either changes.
		void query;
		let stale = false;
		void fetchView().then((result) => {
			if (!stale && result) {
				current = result as PromptView;
			}
		});
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		if (view !== 'sweep' || sweepAxis === '') {
			return;
		}
		void query;
		let stale = false;
		void fetchView(`&sweep=${encodeURIComponent(sweepAxis)}`).then((result) => {
			if (!stale && result) {
				swept = (result as { variants: (PromptView & { value: string })[] }).variants;
			}
		});
		return () => {
			stale = true;
		};
	});

	function open(next: Combo) {
		combo = { ...next };
		view = 'explore';
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 1500);
		} catch {
			reportRequestFailure(null, 'Could not copy: the browser refused the clipboard.');
		}
	}

	function download(name: string, contents: string, type: string) {
		const url = URL.createObjectURL(new Blob([contents], { type }));
		const link = document.createElement('a');
		link.href = url;
		link.download = name;
		link.click();
		URL.revokeObjectURL(url);
	}

	const structural = $derived(axes.filter((axis) => axis.kind === 'structural'));
	const descriptive = $derived(axes.filter((axis) => axis.kind === 'descriptive'));
	const changedDescriptive = $derived(
		descriptive.filter((axis) => combo[axis.id] !== axis.baseline).length
	);
</script>

{#snippet axisSelect(axis: (typeof axes)[number])}
	<wa-select
		label={axis.label}
		size="s"
		value={combo[axis.id]}
		data-axis={axis.id}
		{@attach onChoose((value) => {
			combo = { ...combo, [axis.id]: value };
		})}
	>
		{#each axis.values as option (option.id)}
			<wa-option value={option.id}>{option.label}{option.id === axis.baseline ? ' (baseline)' : ''}</wa-option>
		{/each}
	</wa-select>
{/snippet}

<div class="bar">
	<wa-radio-group
		label="View"
		orientation="horizontal"
		size="s"
		value={view}
		{@attach onChoose((value) => {
			view = value as View;
		})}
	>
		{#each VIEWS as option (option.id)}
			<wa-radio appearance="button" value={option.id}>{option.label}</wa-radio>
		{/each}
	</wa-radio-group>
	<wa-select label="Words" size="s" value={source} {@attach onChoose((value) => {
			source = value;
		})}>
		<wa-option value="placeholders">Placeholders</wa-option>
		{#each starters as starter (starter)}
			<wa-option value={starter}>From “{starter}”</wa-option>
		{/each}
	</wa-select>
</div>

{#if view !== 'paragraphs' && view !== 'lint'}
	<div class="axes">
		{#each structural as axis (axis.id)}
			{@render axisSelect(axis)}
		{/each}
	</div>
	{#if descriptive.length > 0}
		<wa-details summary={`More options (${changedDescriptive} changed)`} appearance="plain" class="more">
			<div class="axes">
				{#each descriptive as axis (axis.id)}
					{@render axisSelect(axis)}
				{/each}
			</div>
		</wa-details>
	{/if}
	<p class="combo">
		{describeCombo(axes, combo)}
		{#if describeCombo(axes, combo) !== 'baseline'}
			<wa-button size="s" appearance="plain" onclick={() => open(catalogue.baseline.combo)}>Back to baseline</wa-button>
		{/if}
	</p>
{/if}

{#if view === 'explore'}
	{#if current === null}
		<wa-skeleton effect="sheen"></wa-skeleton>
	{:else if !current.ok}
		<wa-callout variant="neutral" size="s">
			<wa-icon slot="icon" name="ban" variant="solid"></wa-icon>
			No device could send this combination: {current.problem}
		</wa-callout>
	{:else if rendered}
		<div class="actions">
			<wa-button size="s" onclick={() => {
					pinned = rendered;
				}}>Pin as A, to compare</wa-button>
			<wa-button size="s" appearance="outlined" onclick={() => copy(rendered.text)}>
				{copied ? 'Copied' : 'Copy as text'}
			</wa-button>
			<wa-button
				size="s"
				appearance="outlined"
				onclick={() => download(`${catalogue.builder.id}-prompt.json`, JSON.stringify(rendered, null, '\t'), 'application/json')}
			>
				Download JSON
			</wa-button>
		</div>
		<PromptDisplay view={rendered} {reviewed} ontoggle={toggleReviewed} />
	{/if}
{:else if view === 'compare'}
	{#if pinned === null}
		<wa-callout variant="neutral" size="s">
			<wa-icon slot="icon" name="thumbtack" variant="solid"></wa-icon>
			Pin a prompt as A from Explore, then choose other options here to compare it with.
		</wa-callout>
	{:else if current?.ok}
		<PromptDiff
			before={pinned.text}
			after={current.text}
			beforeLabel={`A: ${describeCombo(axes, pinned.combo)}`}
			afterLabel={`B: ${describeCombo(axes, current.combo)}`}
		/>
	{:else if current}
		<p>No device could send B: {current.problem}</p>
	{/if}
{:else if view === 'sweep'}
	<div class="axes">
		<wa-select label="Option to sweep" size="s" value={sweepAxis} {@attach onChoose((value) => {
			sweepAxis = value;
		})}>
			{#each axes as axis (axis.id)}
				<wa-option value={axis.id}>{axis.label}</wa-option>
			{/each}
		</wa-select>
	</div>
	{#if rendered}
		{#each swept.filter((variant) => variant.value !== combo[sweepAxis]) as variant (variant.value)}
			<wa-details summary={`${sweepAxis} = ${variant.value}`} appearance="plain" class="variant">
				{#if variant.ok}
					<PromptDiff
						before={rendered.text}
						after={variant.text}
						beforeLabel={`${sweepAxis} = ${combo[sweepAxis]}`}
						afterLabel={`${sweepAxis} = ${variant.value}`}
					/>
				{:else}
					<p>No device could send this: {variant.problem}</p>
				{/if}
			</wa-details>
		{/each}
	{/if}
{:else if view === 'paragraphs'}
	<ParagraphList {catalogue} {reviewed} ontoggle={toggleReviewed} onopen={open} />
{:else}
	<p class="combo">
		{catalogue.distinctPrompts.toLocaleString('en')} distinct prompts from
		{catalogue.structuralTotal.toLocaleString('en')} valid combinations of the structural options.
	</p>
	{#if catalogue.lint.length === 0}
		<p>Lint found nothing.</p>
	{:else}
		<ul class="findings">
			{#each catalogue.lint as finding, index (index)}
				<li>
					<strong>{LINT_RULE_LABELS[finding.rule]}</strong>, in {finding.count} prompts
					<pre>{finding.excerpt}</pre>
					<wa-button size="s" appearance="plain" onclick={() => open(finding.example)}>Open an example</wa-button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if catalogue.invalid.length > 0}
		<h2>Combinations no device could send</h2>
		<ul class="findings">
			{#each catalogue.invalid as entry (entry.problem)}
				<li>{entry.count} × {entry.problem}</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem;
		margin-block-end: 1rem;

		wa-select {
			flex: 1 1 12rem;
		}
	}

	.axes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.5rem 0.75rem;
	}

	.more {
		margin-block-start: 0.5rem;
	}

	.combo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0.75rem 0;
		font-family: var(--wa-font-family-code, monospace);
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-block-end: 0.75rem;
	}

	.variant {
		margin-block-start: 0.75rem;
	}

	h2 {
		font-size: var(--wa-font-size-m);
	}

	.findings {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0;
		list-style: none;

		pre {
			margin: 0.25rem 0;
			white-space: pre-wrap;
			overflow-wrap: anywhere;
			font-family: var(--wa-font-family-code, monospace);
			font-size: 0.8125rem;
		}
	}
</style>
