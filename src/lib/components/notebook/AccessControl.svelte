<script lang="ts">
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SelectField from '$lib/components/SelectField.svelte';
	import type { PartnerAccess } from '$lib/notebook';
	import { partnerAccessSchema } from '$lib/schemas/notebook';
	import { superForm } from '$lib/superform';

	/**
	 * Who else may see a partnership entry, for the member with the say over
	 * it: whoever holds control, or with control shared, its creator.
	 *
	 * Shown only to someone `canSetAccess` allows, and display only: the
	 * action re-checks the say against the stored rows before applying
	 * it (AGENTS.md invariant 14).
	 */
	let {
		access,
		partnerLabel,
		oncancel
	}: {
		access: PartnerAccess;
		partnerLabel: string;
		/** Offers a Cancel, which puts the choice back as it is saved and calls this. */
		oncancel?: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captured once, as every superform is: the stores are the live connection.
	// No id of its own: the action answers with a form of the default id for
	// this schema, which is what lets superforms match the two.
	const superform = superForm(defaults({ access }, zod4Client(partnerAccessSchema)), {
		resetForm: false,
		validators: zod4Client(partnerAccessSchema)
	});
	const { enhance, tainted, submitting, reset } = superform;

	function cancel() {
		reset();
		oncancel?.();
	}

	const options = $derived([
		{ value: 'edit', label: `${partnerLabel} can edit it` },
		{ value: 'read', label: `${partnerLabel} can only read it` },
		{ value: 'hidden', label: `Hidden from ${partnerLabel}` }
	]);

	// Outlined until there is a change to save, as every save button is.
	const changed = $derived(Boolean($tainted?.access));
</script>

<form method="POST" action="?/setAccess" use:enhance class="access">
	<SelectField {superform} field="access" title="Who else can see this entry" {options} />
	<div class="actions">
		{#if oncancel}
			<wa-button size="s" appearance="plain" onclick={cancel}>Cancel</wa-button>
		{/if}
		<wa-button
			type="submit"
			size="s"
			variant={changed ? 'brand' : 'neutral'}
			appearance={changed ? 'accent' : 'outlined'}
			disabled={$submitting}>Save</wa-button
		>
	</div>
</form>

<style>
	/* A column: the choice across its whole width, and its buttons under it
	   at the end, so whatever holds it has nothing left over at one side. */
	.access {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--wa-space-xs);
	}
</style>
