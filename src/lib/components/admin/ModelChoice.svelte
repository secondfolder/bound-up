<script lang="ts" module>
	type T = Record<string, unknown>;

	/** A preset as the picker shows it: what it is called, and what it currently sends to. */
	export type ModelPresetOption = {
		id: string;
		label: string;
		description: string;
		/** The provider's id for the model this preset is today. */
		modelId: string;
		/** Its base model, for a picture model. */
		baseLabel?: string;
	};
</script>

<script lang="ts" generics="T extends Record<string, unknown>">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { get } from 'svelte/store';
	import { type FormPathLeaves, formFieldProxy, type SuperForm } from 'sveltekit-superforms';
	import InputField from '$lib/components/InputField.svelte';
	import type { OpenRouterModelResult, RunwareModelResult } from '$lib/model-search';
	import { MODEL_PROVIDERS, type ModelProviderId, PICTURE_BASE_MODELS } from '$lib/server-settings';
	import ModelDetails from './ModelDetails.svelte';
	import ModelSearch from './ModelSearch.svelte';

	/**
	 * One model setting on Admin → Server settings: a preset, or Custom.
	 *
	 * A preset is named for a family and stored by its name, so the model it
	 * sends to moves when the code does (`server-settings.ts`). Custom stores a
	 * provider's model id exactly, found by searching the provider; for a
	 * picture model it also stores the base model, which decides how the model
	 * is prompted. A search result fills the base model in when Runware's
	 * architecture maps to one, and the admin can change it; whatever the AIR
	 * came from, what Runware says about it is shown beside it
	 * (`ModelDetails`) to help choose.
	 *
	 * `providerField` is drawn first in the fieldset: the `ModelProviderField`
	 * that picks which provider `provider` is.
	 */
	let {
		superform,
		choiceField,
		idField,
		baseField = null,
		provider,
		legend,
		presets,
		providerField,
		onmissing,
		ontools
	}: {
		superform: SuperForm<T>;
		choiceField: FormPathLeaves<T>;
		idField: FormPathLeaves<T>;
		baseField?: FormPathLeaves<T> | null;
		provider: ModelProviderId;
		legend: string;
		presets: readonly ModelPresetOption[];
		providerField?: Snippet;
		/** Whether the provider says it has no model by the custom id (`ModelDetails`). */
		onmissing?: (missing: boolean) => void;
		/** Whether OpenRouter lists the custom model it has found as calling tools. */
		ontools?: (tools: boolean) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captures the initial `superform`/fields on purpose, as `InputField` does.
	const { value: choice } = formFieldProxy(superform, choiceField);
	// svelte-ignore state_referenced_locally
	const { value: modelId } = formFieldProxy(superform, idField);
	// svelte-ignore state_referenced_locally
	const base = baseField ? formFieldProxy(superform, baseField) : null;
	const baseValue = base?.value;
	const baseErrors = base?.errors;

	const providerName = $derived(MODEL_PROVIDERS[provider].label);
	const ID_LABELS: Record<ModelProviderId, string> = {
		openrouter: 'OpenRouter model ID',
		runware: 'Runware model AIR',
		fish: 'Fish Audio voice ID'
	};
	const idLabel = $derived(ID_LABELS[provider]);
	/** What Custom offers: a model by its id, or for a voice provider, a voice. */
	const customHint = $derived(
		provider === 'fish'
			? 'Any voice in Fish Audio’s library, by the ID at the end of its page’s address.'
			: `Any model ${providerName} hosts, by its exact ID.`
	);

	function choose(id: string) {
		$choice = id as typeof $choice;
	}

	function setBase(value: string) {
		if (baseValue) {
			baseValue.set(value as never);
		}
	}

	/** The OpenRouter search result last picked, so its details show without asking again. */
	let pickedOpenRouter = $state<OpenRouterModelResult | null>(null);

	function pickOpenRouter(result: OpenRouterModelResult) {
		pickedOpenRouter = result;
		$modelId = result.openrouterModelId as typeof $modelId;
		ontools?.(result.tools);
	}

	/** The search result last picked, so its details show without asking again. */
	let picked = $state<RunwareModelResult | null>(null);

	function pickRunware(result: RunwareModelResult) {
		picked = result;
		$modelId = result.runwareModelAir as typeof $modelId;
		if (result.base) {
			setBase(result.base);
		}
	}

	/**
	 * A typed or saved AIR, once Runware has said what it is: fills the base
	 * model in only if none is chosen, so it never overrides the admin's.
	 */
	function foundRunware(result: RunwareModelResult) {
		if (result.base && baseValue && !get(baseValue)) {
			setBase(result.base);
		}
	}

	/** `wa-select`'s `change` is listened for directly, as everywhere in the app. */
	const onBaseChange: Attachment<HTMLElement> = (element) => {
		const listener = () => setBase(String((element as HTMLElement & { value: unknown }).value));
		element.addEventListener('change', listener);
		return () => element.removeEventListener('change', listener);
	};

	const name = $derived(String(choiceField));
</script>

<fieldset class="choice">
	<legend>{legend}</legend>
	{@render providerField?.()}
	{#each presets as preset (preset.id)}
		<label class="option">
			<input
				type="radio"
				{name}
				value={preset.id}
				checked={$choice === preset.id}
				onchange={() => choose(preset.id)}
			/>
			<span class="text">
				<span class="label">{preset.label}</span>
				<small>{preset.description}</small>
				<small class="id"
					><code>{preset.modelId}</code>{#if preset.baseLabel}
						· {preset.baseLabel}{/if}</small
				>
			</span>
		</label>
	{/each}
	<label class="option">
		<input
			type="radio"
			{name}
			value="custom"
			checked={$choice === 'custom'}
			onchange={() => choose('custom')}
		/>
		<span class="text">
			<span class="label">Custom</span>
			<small>{customHint}</small>
		</span>
	</label>

	{#if $choice === 'custom'}
		<div class="custom">
			<!-- Fish's library has no search here: its voices are found on its site. -->
			{#if provider === 'openrouter'}
				<ModelSearch provider="openrouter" label="Search OpenRouter" onpick={pickOpenRouter} />
			{:else if provider === 'runware'}
				<ModelSearch provider="runware" label="Search Runware" onpick={pickRunware} />
			{/if}
			<InputField {superform} field={idField} title={idLabel} type="text" autocomplete="off" />
			{#if provider === 'runware'}
				<ModelDetails
					provider="runware"
					modelId={String($modelId ?? '')}
					known={picked}
					onfound={foundRunware}
					{onmissing}
				/>
			{:else if provider === 'openrouter'}
				<ModelDetails
					provider="openrouter"
					modelId={String($modelId ?? '')}
					known={pickedOpenRouter}
					onfound={(result) => ontools?.(result.tools)}
					{onmissing}
				/>
			{/if}
			{#if baseField && baseValue}
				<div class="base">
					<wa-select
						label="Base model"
						name={String(baseField)}
						value={String($baseValue ?? '')}
						hint="Decides how its prompts are written. A search result fills this in when Runware says."
						{@attach onBaseChange}
					>
						<wa-option value="">Choose one</wa-option>
						{#each PICTURE_BASE_MODELS as option (option.id)}
							<wa-option value={option.id}>{option.label}</wa-option>
						{/each}
					</wa-select>
					{#if baseErrors && $baseErrors}<span class="invalid">{$baseErrors}</span>{/if}
				</div>
			{/if}
		</div>
	{/if}
</fieldset>

<style>
	.choice {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;

		legend {
			margin-bottom: 0.5rem;
			padding: 0;
			font-weight: var(--wa-font-weight-semibold);
		}
	}

	.option {
		display: flex;
		box-sizing: border-box;
		width: 100%;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		cursor: pointer;

		&:has(input:checked) {
			border-color: var(--wa-color-brand-border-loud);
			background: var(--wa-color-brand-fill-quiet);
		}

		input {
			margin-top: 0.25rem;
			accent-color: var(--wa-color-brand-fill-loud);
		}

		.text {
			display: flex;
			flex-direction: column;
			gap: 0.15rem;
			min-width: 0;
		}

		small {
			color: var(--wa-color-text-quiet);
		}

		.id {
			overflow-wrap: anywhere;
		}
	}

	.custom {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem 0 0 1.75rem;
	}

	.base {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;

		.invalid {
			color: var(--wa-color-text-danger);
		}
	}
</style>
