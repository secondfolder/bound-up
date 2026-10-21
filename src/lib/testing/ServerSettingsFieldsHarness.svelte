<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import ModelChoice, { type ModelPresetOption } from '$lib/components/admin/ModelChoice.svelte';
	import ModelProviderField from '$lib/components/admin/ModelProviderField.svelte';
	import SecretSettingField from '$lib/components/admin/SecretSettingField.svelte';
	import type {
		imageModelSettingsFormSchema,
		modelProviderFormSchema
	} from '$lib/schemas/serverSettingsForms';
	import { IMAGE_PROVIDERS, type ModelProviderId } from '$lib/server-settings';
	import { superForm } from '$lib/superform';

	/**
	 * Test-only wrapper: `SecretSettingField`, `ModelProviderField` and
	 * `ModelChoice` take a superform, and `superForm` can only be called while
	 * a component initialises. Shows the model form's data as JSON, so a test
	 * can read what would be saved.
	 */
	let {
		data,
		keyData,
		stored,
		presets,
		keySet = () => true,
		onaddkey = () => undefined
	}: {
		data: SuperValidated<Infer<typeof imageModelSettingsFormSchema>>;
		keyData: SuperValidated<Infer<typeof modelProviderFormSchema>>;
		stored: { set: boolean; tail: string };
		presets: ModelPresetOption[];
		keySet?: (provider: ModelProviderId) => boolean;
		onaddkey?: (provider: ModelProviderId) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captures the initial `data` on purpose, as every page's superform does.
	const superform = superForm(data);
	const { form } = superform;
	// svelte-ignore state_referenced_locally
	const keyForm = superForm(keyData);
</script>

<form>
	<SecretSettingField
		superform={keyForm}
		field="apiKey"
		changeField="apiKeyChange"
		label="Runware API key"
		{stored}
	/>
</form>
<form>
	<ModelChoice
		{superform}
		choiceField="photoModel"
		idField="photoRunwareModelAir"
		baseField="photoBase"
		provider={$form.photoProvider}
		legend="Photo model"
		{presets}
	>
		{#snippet providerField()}
			<ModelProviderField
				{superform}
				field="photoProvider"
				choiceField="photoModel"
				idField="photoRunwareModelAir"
				baseField="photoBase"
				providers={IMAGE_PROVIDERS}
				firstPreset={() => 'dark-beast'}
				{keySet}
				{onaddkey}
			/>
		{/snippet}
	</ModelChoice>
</form>
<pre data-testid="form">{JSON.stringify($form)}</pre>
