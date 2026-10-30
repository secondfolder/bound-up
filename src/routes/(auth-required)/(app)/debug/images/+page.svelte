<script lang="ts">
	import { onMount } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { resolve } from '$app/paths';
	import ModelSearch from '$lib/components/admin/ModelSearch.svelte';
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import RadioButton from '$lib/components/segmented/RadioButton.svelte';
	import RadioButtonGroup from '$lib/components/segmented/RadioButtonGroup.svelte';
	import type { PictureArchitecture } from '$lib/daydream/image-prompt';
	import { NEGATIVE_MINORS } from '$lib/daydream/image-prompt';
	import {
		MAX_PLAYGROUND_MODELS,
		PLAYGROUND_FORMATS,
		PLAYGROUND_SCHEDULERS,
		PLAYGROUND_SIZES,
		type PlaygroundEntry,
		type PlaygroundRun,
		playgroundDefaults
	} from '$lib/image-playground';
	import { readNumberText } from '$lib/number-text';
	import { reportRequestFailure, tryFetch } from '$lib/request-failure.svelte';
	import {
		type ImagePlaygroundForm,
		imagePlaygroundFormSchema
	} from '$lib/schemas/imagePlaygroundForm';
	import { PICTURE_BASE_MODELS } from '$lib/server-settings';
	import { superForm } from '$lib/superform';
	import type { PageProps } from './$types';

	/**
	 * The picture playground (docs/debug-mode.md, "Picture playground"): one
	 * prompt, drawn by every model ticked, side by side, with every setting
	 * Runware takes. Each run is kept with its settings where the server has a
	 * disk, and any can be loaded back into the form to change one thing.
	 */
	let { data }: PageProps = $props();

	type Model = { runwareModelAir: string; label: string; architecture: PictureArchitecture };
	type Column = {
		model: Model;
		status: 'drawing' | 'done' | 'failed';
		entry?: PlaygroundEntry;
		message?: string;
	};
	type Comparison = { runId: string; at: string; run: PlaygroundRun; columns: Column[] };

	const ARCHITECTURE_LABELS: Record<PictureArchitecture, string> = {
		sdxl: 'SDXL',
		'z-image-turbo': 'Z-Image Turbo',
		'flux-2': 'FLUX.2'
	};

	// svelte-ignore state_referenced_locally
	const initialModels: Model[] = [
		...data.presets,
		// What this server draws daydreams with, when it is not a preset.
		...data.inUse
			.filter(
				(used) => !data.presets.some((preset) => preset.runwareModelAir === used.runwareModelAir)
			)
			.map((used) => ({
				runwareModelAir: used.runwareModelAir,
				label: `This server’s ${used.style} model`,
				architecture: used.architecture
			}))
	];
	let models = $state<Model[]>(initialModels);
	// The first preset to start with: one ticked is a picture; a comparison is a choice.
	let chosen = $state<Set<string>>(
		new Set(initialModels.slice(0, 1).map((model) => model.runwareModelAir))
	);
	let comparisons = $state<Comparison[]>([]);
	let kept = $state<boolean | null>(null);

	const start: ImagePlaygroundForm = {
		recipe: 'app',
		prompt: '',
		negativePrompt: '',
		style: 'photo',
		heat: 'none',
		width: '',
		height: '',
		steps: '',
		CFGScale: '',
		scheduler: 'default',
		seed: '',
		sameSeed: true,
		clipSkip: 'default',
		numberResults: '1',
		outputFormat: 'WEBP'
	};
	const superform = superForm(
		defaults(start, zod4Client(imagePlaygroundFormSchema), { id: 'image-playground' }),
		{
			SPA: true,
			applyAction: false,
			invalidateAll: false,
			resetForm: false,
			dataType: 'json',
			validators: zod4Client(imagePlaygroundFormSchema),
			onUpdate({ form: submitted }) {
				if (submitted.valid) {
					draw(submitted.data);
				}
			}
		}
	);
	const { form, enhance, allErrors } = superform;

	const picked = $derived(models.filter((model) => chosen.has(model.runwareModelAir)));
	const ready = $derived(
		$form.prompt.trim() !== '' && picked.length > 0 && $allErrors.length === 0 && data.hasKey
	);

	/** What one model would be drawn with, for the placeholders, from the first one ticked. */
	const recipeDefaults = $derived(playgroundDefaults($form.style, picked[0]?.architecture ?? 'sdxl'));

	function numberOrNull(text: string): number | null {
		return readNumberText(text).value;
	}

	function runFor(
		settings: ImagePlaygroundForm,
		runId: string,
		seed: number | null,
		model: Model
	): PlaygroundRun {
		return {
			runId,
			recipe: settings.recipe,
			prompt: settings.prompt,
			negativePrompt: settings.negativePrompt,
			style: settings.style,
			heat: settings.heat === 'none' ? null : (Number(settings.heat) as 1 | 2 | 3 | 4 | 5),
			model,
			width: numberOrNull(settings.width),
			height: numberOrNull(settings.height),
			steps: numberOrNull(settings.steps),
			CFGScale: numberOrNull(settings.CFGScale),
			scheduler: settings.scheduler === 'default' ? null : settings.scheduler,
			seed,
			clipSkip: settings.clipSkip === 'default' ? null : Number(settings.clipSkip),
			numberResults: Number(settings.numberResults),
			outputFormat: settings.outputFormat
		};
	}

	function draw(settings: ImagePlaygroundForm) {
		const runId = crypto.randomUUID();
		const typed = numberOrNull(settings.seed);
		// One seed for every model unless asked otherwise, chosen here when none
		// was typed, so the pictures differ by model and not by luck.
		const seed = typed ?? (settings.sameSeed ? 1 + Math.floor(Math.random() * 2 ** 31) : null);
		const columns: Column[] = picked.map((model) => ({ model, status: 'drawing' }));
		const comparison: Comparison = {
			runId,
			at: new Date().toISOString(),
			run: runFor(settings, runId, seed, picked[0] as Model),
			columns
		};
		comparisons = [comparison, ...comparisons];
		const live = comparisons[0] as Comparison;
		live.columns.forEach((column, index) => {
			void drawOne(runFor(settings, runId, seed, column.model)).then((answer) => {
				const target = live.columns[index] as Column;
				Object.assign(target, answer);
			});
		});
	}

	async function drawOne(run: PlaygroundRun): Promise<Partial<Column>> {
		const response = await tryFetch('/api/debug/images', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(run)
		});
		if (!response) {
			reportRequestFailure(null);
			return { status: 'failed', message: 'The server could not be reached.' };
		}
		const answer: unknown = await response.json().catch(() => null);
		if (!response.ok) {
			// Runware's reason, or ours, in the column: a refused setting is
			// what this page is for finding out.
			const message =
				typeof answer === 'object' && answer !== null && 'message' in answer
					? String(answer.message)
					: `The server answered ${response.status}.`;
			return { status: 'failed', message };
		}
		return { status: 'done', entry: answer as PlaygroundEntry };
	}

	/** Puts a run's settings back in the form, and ticks its models. */
	function reuse(comparison: Comparison) {
		const { run } = comparison;
		$form.recipe = run.recipe;
		$form.prompt = run.prompt;
		$form.negativePrompt = run.negativePrompt;
		$form.style = run.style;
		$form.heat = run.heat === null ? 'none' : (String(run.heat) as ImagePlaygroundForm['heat']);
		$form.width = run.width === null ? '' : String(run.width);
		$form.height = run.height === null ? '' : String(run.height);
		$form.steps = run.steps === null ? '' : String(run.steps);
		$form.CFGScale = run.CFGScale === null ? '' : String(run.CFGScale);
		$form.scheduler = run.scheduler ?? 'default';
		$form.seed = run.seed === null ? '' : String(run.seed);
		$form.clipSkip =
			run.clipSkip === null ? 'default' : (String(run.clipSkip) as ImagePlaygroundForm['clipSkip']);
		$form.numberResults = String(run.numberResults) as ImagePlaygroundForm['numberResults'];
		$form.outputFormat = run.outputFormat;
		for (const column of comparison.columns) {
			addModel(column.model);
		}
		chosen = new Set(comparison.columns.map((column) => column.model.runwareModelAir));
		document.querySelector('#playground-form')?.scrollIntoView({ behavior: 'smooth' });
	}

	async function forget(comparison: Comparison) {
		const response = await tryFetch(`/api/debug/images?run=${comparison.runId}`, {
			method: 'DELETE'
		});
		if (!response?.ok) {
			reportRequestFailure(response);
			return;
		}
		comparisons = comparisons.filter((each) => each.runId !== comparison.runId);
	}

	function addModel(model: Model) {
		if (!models.some((each) => each.runwareModelAir === model.runwareModelAir)) {
			models = [...models, model];
		}
	}

	function toggle(model: Model, on: boolean) {
		const next = new Set(chosen);
		if (on) {
			next.add(model.runwareModelAir);
		} else {
			next.delete(model.runwareModelAir);
		}
		chosen = next;
	}

	/** A `wa-checkbox`'s change, heard directly: delegation does not cross its shadow root (AGENTS.md). */
	function onToggle(model: Model): Attachment<HTMLElement> {
		return (element) => {
			const listener = () =>
				toggle(model, Boolean((element as HTMLElement & { checked: boolean }).checked));
			element.addEventListener('change', listener);
			return () => element.removeEventListener('change', listener);
		};
	}

	function setArchitecture(model: Model, architecture: PictureArchitecture) {
		models = models.map((each) =>
			each.runwareModelAir === model.runwareModelAir ? { ...each, architecture } : each
		);
	}

	function chooseSize(event: CustomEvent<{ item: HTMLElement & { value?: string } }>) {
		const size = PLAYGROUND_SIZES[Number(event.detail.item.value)];
		if (size) {
			$form.width = String(size.width);
			$form.height = String(size.height);
		}
	}

	onMount(async () => {
		const response = await tryFetch('/api/debug/images');
		if (!response?.ok) {
			reportRequestFailure(response);
			return;
		}
		const answer = (await response.json()) as { kept: boolean; entries: PlaygroundEntry[] };
		({ kept } = answer);
		// Entries come newest first; a comparison is every entry with its run id.
		const byRun = new Map<string, Comparison>();
		for (const entry of answer.entries) {
			let comparison = byRun.get(entry.runId);
			if (!comparison) {
				comparison = { runId: entry.runId, at: entry.at, run: entry.run, columns: [] };
				byRun.set(entry.runId, comparison);
			}
			comparison.columns.push({ model: entry.run.model, status: 'done', entry });
			addModel(entry.run.model);
		}
		for (const comparison of byRun.values()) {
			comparison.columns.sort((a, b) => a.model.label.localeCompare(b.model.label));
		}
		comparisons = [...comparisons, ...byRun.values()];
	});

	function cost(entry: PlaygroundEntry): string | null {
		const total = entry.images.reduce((sum, image) => sum + (image.cost ?? 0), 0);
		return entry.images.some((image) => image.cost !== null) ? `$${total.toFixed(4)}` : null;
	}

	const SCHEDULER_OPTIONS = [
		{ value: 'default', label: 'The model’s default' },
		...PLAYGROUND_SCHEDULERS.map((name) => ({ value: name, label: name }))
	];
	const HEAT_OPTIONS = [
		{ value: 'none', label: 'Not given' },
		{ value: '1', label: '1 · SFW' },
		{ value: '2', label: '2' },
		{ value: '3', label: '3' },
		{ value: '4', label: '4' },
		{ value: '5', label: '5' }
	];
	const CLIP_SKIP_OPTIONS = [
		{ value: 'default', label: 'The model’s default' },
		{ value: '0', label: '0' },
		{ value: '1', label: '1' },
		{ value: '2', label: '2' }
	];
	const COUNT_OPTIONS = ['1', '2', '3', '4'].map((value) => ({ value, label: value }));
	const FORMAT_OPTIONS = PLAYGROUND_FORMATS.map((value) => ({ value, label: value }));
	const ARCHITECTURES = [...new Set(PICTURE_BASE_MODELS.map((base) => base.architecture))];
</script>

<svelte:head>
	<title>Picture playground · Bound Up</title>
</svelte:head>

<section class="playground">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/debug')}
		backLabel="Back to debug tools"
		backText="Debug tools"
		title="Picture playground"
	/>

	<div class="body">
		{#if !data.hasKey}
			<wa-callout variant="warning">
				<wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
				Save a Runware API key under Admin → Server settings → Model providers to draw anything.
			</wa-callout>
		{/if}

		<form id="playground-form" method="POST" use:enhance>
			<RadioButtonGroup label="Recipe" bind:value={$form.recipe}>
				<RadioButton value="app">As the daydreams draw</RadioButton>
				<RadioButton value="raw">Raw</RadioButton>
			</RadioButtonGroup>
			<p class="hint">
				{#if $form.recipe === 'app'}
					The prompt is a daydream’s description. Each model gets the words, negative prompt,
					steps and guidance the daydreams would give its base; anything set below overrides them.
				{:else}
					The prompt and negative prompt are sent as typed, with each model’s own steps and
					guidance unless set below.
				{/if}
				Either way, a prompt that mentions anyone under 18 is refused, and the negative prompt
				always starts with “{NEGATIVE_MINORS.join(', ')}”.
			</p>

			<InputField {superform} field="prompt" type="textarea" title="Prompt" rows={4} resize="auto" />
			<InputField
				{superform}
				field="negativePrompt"
				type="textarea"
				title="Negative prompt (optional)"
				rows={2}
				resize="auto"
				required={false}
			/>
			{#if $form.recipe === 'app'}
				<div class="pair">
					<RadioButtonGroup label="Style" bind:value={$form.style}>
						<RadioButton value="photo">Photo</RadioButton>
						<RadioButton value="illustrated">Illustrated</RadioButton>
					</RadioButtonGroup>
					<SelectField {superform} field="heat" title="Heat" options={HEAT_OPTIONS} />
				</div>
			{/if}

			<fieldset class="models">
				<legend>Models <small>(up to {MAX_PLAYGROUND_MODELS}, drawn side by side)</small></legend>
				{#each models as model (model.runwareModelAir)}
					<div class="model">
						<wa-checkbox
							checked={chosen.has(model.runwareModelAir)}
							disabled={!chosen.has(model.runwareModelAir) && picked.length >= MAX_PLAYGROUND_MODELS}
							{@attach onToggle(model)}
						>
							{model.label}
							<small class="air">{model.runwareModelAir}</small>
						</wa-checkbox>
						<wa-dropdown
							placement="bottom-end"
							onwa-select={(event: CustomEvent<{ item: HTMLElement & { value?: string } }>) =>
								setArchitecture(model, (event.detail.item.value ?? 'sdxl') as PictureArchitecture)}
						>
							<wa-button slot="trigger" size="s" appearance="outlined" with-caret>
								{ARCHITECTURE_LABELS[model.architecture]}
							</wa-button>
							{#each ARCHITECTURES as architecture (architecture)}
								<wa-dropdown-item type="checkbox" value={architecture} checked={model.architecture === architecture}>
									{ARCHITECTURE_LABELS[architecture]}
								</wa-dropdown-item>
							{/each}
						</wa-dropdown>
					</div>
				{/each}
				<ModelSearch
					provider="runware"
					label="Add any Runware model"
					onpick={(result) => {
						const model: Model = {
							runwareModelAir: result.runwareModelAir,
							label: [result.name, result.version].filter(Boolean).join(' · ') || result.runwareModelAir,
							architecture:
								PICTURE_BASE_MODELS.find((base) => base.id === result.base)?.architecture ?? 'sdxl'
						};
						addModel(model);
						toggle(model, picked.length < MAX_PLAYGROUND_MODELS);
					}}
				/>
			</fieldset>

			<fieldset class="settings">
				<legend>Settings <small>(empty is what the recipe gives each model)</small></legend>
				<div class="size">
					<InputField {superform} field="width" type="text" inputmode="numeric" title="Width" placeholder={String(recipeDefaults.width)} required={false} />
					<InputField {superform} field="height" type="text" inputmode="numeric" title="Height" placeholder={String(recipeDefaults.height)} required={false} />
					<wa-dropdown onwa-select={chooseSize}>
						<wa-button slot="trigger" appearance="outlined" with-caret>Sizes</wa-button>
						{#each PLAYGROUND_SIZES as size, index (size.label)}
							<wa-dropdown-item value={String(index)}>{size.label}</wa-dropdown-item>
						{/each}
					</wa-dropdown>
				</div>
				<div class="grid">
					<InputField {superform} field="steps" type="text" inputmode="numeric" title="Steps" placeholder={recipeDefaults.steps === null ? 'Runware’s default' : String(recipeDefaults.steps)} required={false} />
					<InputField {superform} field="CFGScale" type="text" inputmode="decimal" title="Guidance (CFG)" placeholder={recipeDefaults.CFGScale === null ? 'Runware’s default' : String(recipeDefaults.CFGScale)} required={false} />
					<SelectField {superform} field="scheduler" title="Scheduler" options={SCHEDULER_OPTIONS} />
					<SelectField {superform} field="clipSkip" title="Clip skip" options={CLIP_SKIP_OPTIONS} />
					<InputField {superform} field="seed" type="text" inputmode="numeric" title="Seed" placeholder="Random" required={false} />
					<SelectField {superform} field="numberResults" title="Pictures per model" options={COUNT_OPTIONS} />
					<SelectField {superform} field="outputFormat" title="Format" options={FORMAT_OPTIONS} />
				</div>
				<CheckboxField {superform} field="sameSeed" title="The same seed for every model" />
			</fieldset>

			<div class="actions">
				<wa-button
					type="submit"
					appearance={ready ? 'accent' : 'outlined'}
					variant={ready ? 'brand' : 'neutral'}
					disabled={!data.hasKey}
				>
					Draw{picked.length > 1 ? ` with ${picked.length} models` : ''}
				</wa-button>
			</div>
		</form>

		{#if kept === false}
			<p class="hint">
				This server has no disk of its own, so pictures are not kept: they last as long as this page.
			</p>
		{/if}

		<ol class="comparisons" aria-label="Pictures drawn">
			{#each comparisons as comparison (comparison.runId)}
				<li class="comparison">
					<header>
						<div class="said">
							<time datetime={comparison.at}>{new Date(comparison.at).toLocaleString()}</time>
							<p class="prompt">{comparison.run.prompt}</p>
						</div>
						<wa-button size="s" appearance="outlined" onclick={() => reuse(comparison)}>Use these settings</wa-button>
						{#if kept}
							<wa-button size="s" appearance="plain" onclick={() => forget(comparison)}>
								<wa-icon name="trash" label="Forget this run"></wa-icon>
							</wa-button>
						{/if}
					</header>
					<div class="columns">
						{#each comparison.columns as column (column.model.runwareModelAir)}
							<article class="column" aria-label={column.model.label}>
								<h3>{column.model.label}</h3>
								{#if column.status === 'drawing'}
									<div class="drawing"><wa-spinner></wa-spinner> Drawing…</div>
								{:else if column.status === 'failed'}
									<p class="failed">{column.message}</p>
								{:else if column.entry}
									{@render drawn(column.model, column.entry)}
								{/if}
							</article>
						{/each}
					</div>
				</li>
			{/each}
		</ol>
	</div>
</section>

{#snippet drawn(model: Model, entry: PlaygroundEntry)}
	{#each entry.images as image, index (index)}
		<a href={image.src} target="_blank" rel="noopener">
			<img src={image.src} alt={`${model.label}, picture ${index + 1}`} />
		</a>
		<p class="meta">
			Seed {image.seed ?? '?'}{image.nsfw ? ' · flagged NSFW' : ''}
		</p>
	{/each}
	<p class="meta">
		{entry.task.width}×{entry.task.height} · {entry.task.steps ?? 'default'} steps · CFG {entry.task.CFGScale ?? 'default'}
		{entry.task.scheduler ? ` · ${entry.task.scheduler}` : ''} · {(entry.ms / 1000).toFixed(1)}s{cost(entry) ? ` · ${cost(entry)}` : ''}
	</p>
	<wa-details summary="What was sent">
		<pre>{JSON.stringify(entry.task, null, 2)}</pre>
	</wa-details>
{/snippet}

<style>
	.playground {
		max-width: var(--page-width-wide);
		margin: 0 auto;
		width: 100%;
		padding-bottom: var(--wa-space-l);
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-l);
		padding: var(--wa-space-l) var(--page-gutter) 0;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
	}

	.hint {
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}

	.pair {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--wa-space-m);
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
		margin: 0;
		padding: var(--wa-space-m);
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);

		legend {
			padding-inline: var(--wa-space-2xs);
			font-weight: var(--wa-font-weight-semibold);

			small {
				font-weight: normal;
				color: var(--wa-color-text-quiet);
			}
		}
	}

	.model {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-s);
	}

	.air {
		display: block;
		color: var(--wa-color-text-quiet);
		overflow-wrap: anywhere;
	}

	.size {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--wa-space-s);

		> :global(*) {
			flex: 1 1 8rem;
		}

		wa-dropdown {
			flex: none;
		}
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: var(--wa-space-s);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}

	.comparisons {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-l);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.comparison {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
		padding-top: var(--wa-space-m);
		border-top: 1px solid var(--wa-color-surface-border);

		header {
			display: flex;
			align-items: start;
			gap: var(--wa-space-s);
		}
	}

	.said {
		flex: 1 1 auto;
		min-width: 0;

		time {
			color: var(--wa-color-text-quiet);
			font-size: var(--wa-font-size-s);
		}
	}

	.prompt {
		margin: var(--wa-space-3xs) 0 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.columns {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: var(--wa-space-m);
	}

	.column {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-2xs);
		min-width: 0;

		h3 {
			margin: 0;
			font-size: var(--wa-font-size-m);
		}

		img {
			display: block;
			width: 100%;
			height: auto;
			border-radius: var(--wa-border-radius-m);
		}

		pre {
			margin: 0;
			font-size: var(--wa-font-size-xs);
			white-space: pre-wrap;
			overflow-wrap: anywhere;
		}
	}

	.drawing {
		display: flex;
		align-items: center;
		gap: var(--wa-space-xs);
		color: var(--wa-color-text-quiet);
	}

	.failed {
		margin: 0;
		color: var(--wa-color-danger-on-quiet);
	}

	.meta {
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}
</style>
