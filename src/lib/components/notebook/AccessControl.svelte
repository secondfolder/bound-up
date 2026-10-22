<script lang="ts">
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SelectField from '$lib/components/SelectField.svelte';
	import type { PartnerAccess } from '$lib/notebook';
	import { partnerAccessSchema } from '$lib/schemas/notebook';
	import { superForm } from '$lib/superform';

	/**
	 * Who else may see a partnership entry, for a member who holds control.
	 *
	 * Shown only to someone `canSetAccess` allows, and display only: the
	 * action re-checks control against the stored partnership before applying
	 * it (AGENTS.md invariant 14).
	 */
	let { access, partnerLabel }: { access: PartnerAccess; partnerLabel: string } = $props();

	// svelte-ignore state_referenced_locally
	// Captured once, as every superform is: the stores are the live connection.
	// No id of its own: the action answers with a form of the default id for
	// this schema, which is what lets superforms match the two.
	const superform = superForm(defaults({ access }, zod4Client(partnerAccessSchema)), {
		resetForm: false,
		validators: zod4Client(partnerAccessSchema)
	});
	const { enhance, tainted, submitting } = superform;

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
	<wa-button
		type="submit"
		size="s"
		variant={changed ? 'brand' : 'neutral'}
		appearance={changed ? 'accent' : 'outlined'}
		disabled={$submitting}>Save</wa-button
	>
</form>

<style>
	.access {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--wa-space-s);
	}
</style>
