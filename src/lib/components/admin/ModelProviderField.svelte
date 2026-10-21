<script lang="ts" module>
	type T = Record<string, unknown>;
</script>

<script lang="ts" generics="T extends Record<string, unknown>">
	import type { Attachment } from 'svelte/attachments';
	import { type FormPathLeaves, formFieldProxy, type SuperForm } from 'sveltekit-superforms';
	import { MODEL_PROVIDERS, type ModelProviderId } from '$lib/server-settings';

	/**
	 * Which provider a model setting on Admin → Server settings runs on, above
	 * its `ModelChoice`.
	 *
	 * The provider's key is not here: it is set once, under Model providers,
	 * and shared by every model that chooses the provider. When the chosen one
	 * has no key yet, this says so and offers to add one (`onaddkey`), so a
	 * model is never chosen from a provider that cannot run it without the
	 * admin being told.
	 *
	 * Changing provider starts the choice again from that provider's first
	 * preset: a preset or custom id means nothing to any other provider.
	 */
	let {
		superform,
		field,
		choiceField,
		idField,
		baseField = null,
		providers,
		firstPreset,
		keySet,
		onaddkey
	}: {
		superform: SuperForm<T>;
		field: FormPathLeaves<T>;
		choiceField: FormPathLeaves<T>;
		idField: FormPathLeaves<T>;
		baseField?: FormPathLeaves<T> | null;
		providers: readonly ModelProviderId[];
		/** The preset a model setting starts on with each provider. */
		firstPreset: (provider: ModelProviderId) => string;
		/** Whether each provider has a key saved. */
		keySet: (provider: ModelProviderId) => boolean;
		onaddkey: (provider: ModelProviderId) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captures the initial `superform`/fields on purpose, as `InputField` does.
	const { value: provider } = formFieldProxy(superform, field);
	// svelte-ignore state_referenced_locally
	const { value: choice } = formFieldProxy(superform, choiceField);
	// svelte-ignore state_referenced_locally
	const { value: modelId } = formFieldProxy(superform, idField);
	// svelte-ignore state_referenced_locally
	const base = baseField ? formFieldProxy(superform, baseField).value : null;

	const selected = $derived(String($provider) as ModelProviderId);
	const label = $derived(MODEL_PROVIDERS[selected]?.label ?? selected);

	function choose(next: ModelProviderId) {
		if (next === selected) {
			return;
		}
		$provider = next as typeof $provider;
		$choice = firstPreset(next) as typeof $choice;
		$modelId = '' as typeof $modelId;
		base?.set('' as never);
	}

	/** `wa-select`'s `change` is listened for directly, as everywhere in the app. */
	const onChange: Attachment<HTMLElement> = (element) => {
		const listener = () =>
			choose(String((element as HTMLElement & { value: unknown }).value) as ModelProviderId);
		element.addEventListener('change', listener);
		return () => element.removeEventListener('change', listener);
	};
</script>

<div class="provider">
	<wa-select label="Provider" name={String(field)} value={selected} {@attach onChange}>
		{#each providers as id (id)}
			<wa-option value={id}>{MODEL_PROVIDERS[id].label}</wa-option>
		{/each}
	</wa-select>
	{#if !keySet(selected)}
		<wa-callout variant="warning" size="s">
			<wa-icon slot="icon" name="key" variant="solid"></wa-icon>
			<div class="missing">
				<span>{label} has no API key yet, so this model can't be used.</span>
				<wa-button size="s" appearance="outlined" onclick={() => onaddkey(selected)}>
					Add {label} key
				</wa-button>
			</div>
		</wa-callout>
	{/if}
</div>

<style>
	.provider {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.missing {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
</style>
