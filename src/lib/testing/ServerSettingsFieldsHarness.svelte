<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import ModelChoice, { type ModelPresetOption } from '$lib/components/admin/ModelChoice.svelte';
	import SecretSettingField from '$lib/components/admin/SecretSettingField.svelte';
	import type { imageModelSettingsFormSchema } from '$lib/schemas/serverSettingsForms';
	import { superForm } from '$lib/superform';

	/**
	 * Test-only wrapper: `SecretSettingField` and `ModelChoice` take a
	 * superform, and `superForm` can only be called while a component
	 * initialises. Shows the form's data as JSON, so a test can read what
	 * would be saved.
	 */
	let {
		data,
		stored,
		presets
	}: {
		data: SuperValidated<Infer<typeof imageModelSettingsFormSchema>>;
		stored: { set: boolean; tail: string };
		presets: ModelPresetOption[];
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captures the initial `data` on purpose, as every page's superform does.
	const superform = superForm(data);
	const { form } = superform;
</script>

<form>
	<SecretSettingField
		{superform}
		field="runwareApiKey"
		changeField="runwareApiKeyChange"
		label="Runware API key"
		{stored}
	/>
	<ModelChoice
		{superform}
		choiceField="photoModel"
		idField="photoRunwareModelAir"
		baseField="photoBase"
		provider="runware"
		legend="Photo model"
		{presets}
	/>
</form>
<pre data-testid="form">{JSON.stringify($form)}</pre>
