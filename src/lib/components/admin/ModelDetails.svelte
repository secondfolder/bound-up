<script lang="ts">
	import { untrack } from 'svelte';
	import {
		type ModelSearchAnswer,
		type OpenRouterModelResult,
		type RunwareModelResult,
		splitOpenRouterModelId
	} from '$lib/model-search';
	import { reportRequestFailure, tryFetch } from '$lib/request-failure.svelte';
	import { OPENROUTER_MODEL_ID, PICTURE_BASE_MODELS, RUNWARE_MODEL_AIR } from '$lib/server-settings';

	/**
	 * What the provider says about a custom model's id, beside the field, so
	 * the admin can see they have the model they meant: at least its name, and
	 * for a picture model what it needs to choose its base model — the
	 * architecture Runware lists, its description, and the settings its author
	 * recommends (a model that wants ~8 steps at CFG 1 is a distilled one, like
	 * Z-Image Turbo, whatever its name says).
	 *
	 * `known` is a search result already in hand, which needs no lookup. Any
	 * other id — typed, pasted, or saved before — is looked up exactly
	 * (`?id=` / `?air=`), after a pause in typing; `onfound` hears the answer.
	 * An OpenRouter id's `@` suffix is a routing choice, not a different model,
	 * so it is looked up by what comes before it and the suffix is shown.
	 */
	type Props =
		| {
				provider: 'openrouter';
				modelId: string;
				known?: OpenRouterModelResult | null;
				onfound?: (result: OpenRouterModelResult) => void;
		  }
		| {
				provider: 'runware';
				modelId: string;
				known?: RunwareModelResult | null;
				onfound?: (result: RunwareModelResult) => void;
		  };

	let props: Props = $props();

	type Result = OpenRouterModelResult | RunwareModelResult;

	let looked = $state<Result | null>(null);
	let lookup = $state<'idle' | 'looking' | 'missing' | 'message'>('idle');
	let message = $state('');

	const DEBOUNCE_MS = 400;

	const providerName = $derived(props.provider === 'openrouter' ? 'OpenRouter' : 'Runware');
	const target = $derived(props.modelId.trim());
	const valid = $derived(
		(props.provider === 'openrouter' ? OPENROUTER_MODEL_ID : RUNWARE_MODEL_AIR).test(target)
	);
	/** The id a result is listed under: an OpenRouter id without its `@` suffix. */
	const listed = $derived(
		props.provider === 'openrouter' ? splitOpenRouterModelId(target).listed : target
	);
	const suffix = $derived(
		props.provider === 'openrouter' ? splitOpenRouterModelId(target).suffix : ''
	);

	function idOf(result: Result | null | undefined): string | undefined {
		if (!result) {
			return undefined;
		}
		return 'openrouterModelId' in result ? result.openrouterModelId : result.runwareModelAir;
	}

	const details = $derived([props.known, looked].find((result) => idOf(result) === listed) ?? null);

	function found(result: Result) {
		if (props.provider === 'openrouter' && 'openrouterModelId' in result) {
			props.onfound?.(result);
		} else if (props.provider === 'runware' && 'runwareModelAir' in result) {
			props.onfound?.(result);
		}
	}

	$effect(() => {
		const current = listed;
		const query = props.provider === 'openrouter' ? 'id' : 'air';
		if (!valid || idOf(untrack(() => props.known)) === current) {
			lookup = 'idle';
			return;
		}
		if (idOf(untrack(() => looked)) === current) {
			return;
		}
		const controller = new AbortController();
		lookup = 'looking';
		const timer = setTimeout(async () => {
			try {
				const response = await tryFetch(
					`/api/admin/models/${props.provider}?${query}=${encodeURIComponent(current)}`,
					{ signal: controller.signal }
				);
				if (!response) {
					reportRequestFailure(null);
					lookup = 'idle';
					return;
				}
				const answer = (await response.json().catch(() => null)) as ModelSearchAnswer<Result> | null;
				if (response.status === 409 && answer && 'message' in answer) {
					({ message } = answer);
					lookup = 'message';
					return;
				}
				if (!(response.ok && answer && 'results' in answer)) {
					reportRequestFailure(response);
					lookup = 'idle';
					return;
				}
				const [first] = answer.results;
				if (first) {
					looked = first;
					lookup = 'idle';
					found(first);
				} else {
					lookup = 'missing';
				}
			} catch (error) {
				if (!(error instanceof DOMException && error.name === 'AbortError')) {
					throw error;
				}
			}
		}, DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	const baseLabel = (id: string | null) =>
		PICTURE_BASE_MODELS.find((base) => base.id === id)?.label ?? null;

	const money = new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 2
	});
	const count = new Intl.NumberFormat();

	/** Its context and price, for an OpenRouter model; `''` without either. */
	function openrouterFacts(model: OpenRouterModelResult): string {
		return [
			model.contextLength === null ? null : `${count.format(model.contextLength)} tokens of context`,
			model.promptPerMillion === null || model.completionPerMillion === null
				? null
				: `${money.format(model.promptPerMillion)} in, ${money.format(model.completionPerMillion)} out per million tokens`
		]
			.filter(Boolean)
			.join(' · ');
	}

	/** Its author's recommended settings, and what they suggest; `''` without any. */
	function recommendation(model: RunwareModelResult): string {
		const parts = [
			model.defaultSteps === null ? null : `${model.defaultSteps} steps`,
			model.defaultCfg === null ? null : `CFG ${model.defaultCfg}`
		].filter(Boolean);
		if (parts.length === 0) {
			return '';
		}
		return [`Its author recommends ${parts.join(' at ')}.`, settingsHint(model.defaultSteps)]
			.filter(Boolean)
			.join(' ');
	}

	/** What its recommended settings suggest, in the terms of the base models here. */
	function settingsHint(steps: number | null): string {
		if (steps === null) {
			return '';
		}
		if (steps <= 12) {
			return 'Few steps like this usually means a distilled model, such as Z-Image Turbo.';
		}
		return steps >= 20 ? 'Typical of SDXL and the models built on it.' : '';
	}
</script>

<div class="details" aria-live="polite">
	{#if details && 'openrouterModelId' in details}
		<p class="title"><strong>{details.name}</strong></p>
		{#if suffix}
			<p>Sent with <code>@{suffix}</code>, which says how OpenRouter routes it.</p>
		{/if}
		{#if openrouterFacts(details)}<p class="quiet">{openrouterFacts(details)}</p>{/if}
		{#if details.description}<p class="description">{details.description}</p>{/if}
	{:else if details && 'runwareModelAir' in details}
		<p class="title">
			<strong>{details.name}</strong>{#if details.version}<small>{details.version}</small>{/if}
		</p>
		<p>
			Runware lists it as <code>{details.architecture || 'no architecture'}</code>{#if baseLabel(details.base)}, which is {baseLabel(details.base)}.{:else}, which none of the prompt recipes here are written for. Choose the nearest base model below, or a different model.{/if}
		</p>
		{#if details.description}<p class="description">{details.description}</p>{/if}
		{#if recommendation(details)}<p>{recommendation(details)}</p>{/if}
		{#if details.triggerWords}
			<p>Trigger words: <code>{details.triggerWords}</code></p>
		{/if}
		{#if details.tags.length > 0}
			<ul class="tags" aria-label="Tags">
				{#each details.tags as tag (tag)}<li>{tag}</li>{/each}
			</ul>
		{/if}
	{:else if lookup === 'looking'}
		<p class="quiet">Looking it up on {providerName}…</p>
	{:else if lookup === 'missing'}
		<p class="warning">
			{#if props.provider === 'openrouter'}
				OpenRouter doesn't list <code>{listed}</code>, so stories sent to it would fail. Check
				the ID, or search for the model above.
			{:else}
				Runware doesn't host <code>{target}</code>, so no picture could be drawn with it. Check
				the AIR, or search for the model above.
			{/if}
		</p>
	{:else if lookup === 'message'}
		<p class="quiet">{message}</p>
	{/if}
</div>

<style>
	.details {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;

		&:empty {
			display: none;
		}

		p {
			margin: 0;
			overflow-wrap: anywhere;
		}

		.title small {
			margin-inline-start: 0.4rem;
			color: var(--wa-color-text-quiet);
		}

		.description,
		.quiet {
			color: var(--wa-color-text-quiet);
		}

		.warning {
			color: var(--wa-color-warning-on-quiet);
		}

		.tags {
			display: flex;
			flex-wrap: wrap;
			gap: 0.3rem;
			margin: 0;
			padding: 0;

			li {
				list-style-type: none;
				padding: 0.1rem 0.5rem;
				border: 1px solid var(--wa-color-surface-border);
				border-radius: var(--wa-border-radius-pill);
				font-size: var(--wa-font-size-xs);
				color: var(--wa-color-text-quiet);
			}
		}
	}
</style>
