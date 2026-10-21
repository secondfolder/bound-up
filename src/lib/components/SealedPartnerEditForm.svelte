<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import PartnerFields from '$lib/components/PartnerFields.svelte';
	import { heldVaultIdentity } from '$lib/crypto/vaults.svelte';
	import { inviterInviteKey, resealInvite, sealPartnershipNames } from '$lib/partner-sealing';
	import {
		type PartnerNamesSource,
		type PartnershipRole,
		type PartnershipStatus,
		storedNamesFrom,
		type ViewerNames
	} from '$lib/partnership';
	import { type PartnerInviteFormValues, partnerEditFormSchema } from '$lib/schemas/partnerForm';
	import { replaceWithSealed } from '$lib/sealed-forms';
	import { superForm } from '$lib/superform';

	/**
	 * The partner settings form, with names that are sealed before they are
	 * posted (docs/partners.md, "Names are sealed"). Mounted by the page only
	 * once the names are open, so they are in the form from the start and its
	 * own idea of "unchanged" includes them.
	 */
	let {
		partnerEditForm,
		partnership,
		names
	}: {
		partnerEditForm: SuperValidated<PartnerInviteFormValues>;
		partnership: {
			id: string;
			status: PartnershipStatus;
			role: PartnershipRole;
			names: PartnerNamesSource;
		};
		names: ViewerNames;
	} = $props();

	const TEXT_FIELDS = ['partnerName', 'yourName', 'partnerRole', 'yourRole'] as const;

	let problem = $state<string | null>(null);

	// svelte-ignore state_referenced_locally
	// Captured once on purpose: `superForm` registers its lifecycle once, and the
	// page mounts this only after the names are open, so they are already here.
	// A distinct id, because the content is merged into a copy: superforms
	// recognises its initial form by identity, so the original still in
	// `page.data` under the same id would read as an update and be written
	// over the opened content as soon as the page store ticked.
	const superform = superForm(
		{
			...partnerEditForm,
			id: `${partnerEditForm.id}:opened`,
			data: { ...partnerEditForm.data, ...names }
		},
		{
			resetForm: false,
			validators: zod4Client(partnerEditFormSchema),
			async onSubmit({ formData, cancel }) {
				problem = null;
				// superforms validates after `onSubmit`, and this seals what it
				// validated, so it validates first itself.
				const checked = await superform.validateForm({ update: true });
				if (!checked.valid) {
					cancel();
					return;
				}
				const stored = storedNamesFrom(checked.data, partnership.role);
				const sealed = await seal(stored);
				if (typeof sealed === 'string') {
					problem = sealed;
					cancel();
					return;
				}
				replaceWithSealed(formData, TEXT_FIELDS, sealed);
			},
			onResult({ result, cancel }) {
				// A refusal is a message, not a superform: there are no fields of the
				// server's to send back, so it is shown here and the form kept as typed.
				if (result.type === 'failure') {
					cancel();
					problem =
						typeof result.data?.error === 'string'
							? result.data.error
							: 'Those changes could not be saved. Reload and try again.';
				}
			}
		}
	);
	const { form, isTainted, submitting, tainted } = superform;
	// Solid only when there is a valid change to save (AGENTS.md), by
	// superforms' own idea of "changed".
	const canSave = $derived(isTainted($tainted) && partnerEditFormSchema.safeParse($form).success);

	/**
	 * Where the names go: into the vault once the partnership is accepted, or
	 * back under the invite key while it is pending — the inviter's wrap of
	 * which is what opens it here. A string is a problem to show.
	 */
	async function seal(
		stored: ReturnType<typeof storedNamesFrom>
	): Promise<Record<string, string> | string> {
		const { id, status, names: source } = partnership;
		if (status === 'accepted') {
			const outcome = await sealPartnershipNames(id, stored);
			if (!outcome.ok) {
				return outcome.error;
			}
			return {
				namesVaultId: outcome.fields.vaultId,
				namesCiphertext: outcome.fields.ciphertext,
				namesPayloadVersion: String(outcome.fields.payloadVersion),
				expectedRevision: String(source.sealed?.revision ?? 0)
			};
		}
		const keyWrap = source.invite?.keyWrap;
		const key = keyWrap ? await inviterInviteKey(id, keyWrap) : null;
		const recipient = key ? (heldVaultIdentity()?.recipient ?? null) : null;
		if (!(key && recipient)) {
			return 'Create a new link first, then change these.';
		}
		return await resealInvite(id, key, stored, recipient);
	}
</script>

<form id="partner-edit" method="POST" action="?/update" use:superform.enhance>
	<PartnerFields {superform} />
	<div class="actions">
		<!-- `disabled={x}`, never `disabled={x || undefined}`: see AGENTS.md invariant 11. -->
		<wa-button
			type="submit"
			appearance={canSave ? 'accent' : 'outlined'}
			variant={canSave ? 'brand' : undefined}
			disabled={$submitting}>Save</wa-button
		>
	</div>
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
