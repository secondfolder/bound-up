<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import { modelProviderFormSchema } from '$lib/schemas/serverSettingsForms';
	import { MODEL_PROVIDERS, type ModelProviderId } from '$lib/server-settings';
	import { superForm } from '$lib/superform';
	import SecretSettingField from './SecretSettingField.svelte';

	/**
	 * One model provider's API key on Admin → Server settings, in a dialog.
	 *
	 * Opened from the provider's row under Model providers, and from a model
	 * setting whose chosen provider has no key yet: both open this one, so
	 * there is one form per provider and the key is saved in one place,
	 * whichever way the admin came to it. Closes once it has saved.
	 */
	let {
		data,
		provider,
		stored
	}: {
		data: SuperValidated<Infer<typeof modelProviderFormSchema>>;
		provider: ModelProviderId;
		stored: { set: boolean; tail: string };
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captures the load's initial data on purpose, as every page's superform
	// does. `resetForm: false` because the action hands back the form itself,
	// with the typed key cleared.
	const superform = superForm(data, { resetForm: false });
	const { form, message, submitting, tainted, isTainted } = superform;

	const details = $derived(MODEL_PROVIDERS[provider]);
	// Outlined until there is something valid to save (AGENTS.md).
	const canSave = $derived(isTainted($tainted) && modelProviderFormSchema.safeParse($form).success);

	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();

	/** Opens it, clean: nothing typed, and no "Saved." from last time. */
	export function show() {
		superform.reset();
		message.set(undefined);
		if (dialog) {
			dialog.open = true;
		}
	}

	function close() {
		if (dialog) {
			dialog.open = false;
		}
	}

	/** Closes once the action says it saved. */
	const closeOnSaved: Attachment<HTMLElement> = () =>
		message.subscribe((value) => {
			if (value) {
				close();
			}
		});
</script>

<wa-dialog bind:this={dialog} label={details.keyLabel}>
	<form method="POST" action="?/saveModelProvider" use:superform.enhance {@attach closeOnSaved}>
		<input type="hidden" name="provider" value={provider} />
		<p class="lead">
			Every model that runs on {details.label} uses this key, and every request is billed to it.
		</p>
		<SecretSettingField
			{superform}
			field="apiKey"
			changeField="apiKeyChange"
			label={details.keyLabel}
			{stored}
			hint={details.keyHint}
			placeholder={details.keyPlaceholder}
		/>
		<div class="dialog-buttons">
			<wa-button appearance="plain" onclick={close}>Cancel</wa-button>
			<wa-button
				type="submit"
				appearance={canSave ? 'filled' : 'outlined'}
				variant={canSave ? 'brand' : 'neutral'}
				disabled={$submitting}
			>
				Save {details.label} key
			</wa-button>
		</div>
	</form>
</wa-dialog>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.lead {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}

	.dialog-buttons {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
