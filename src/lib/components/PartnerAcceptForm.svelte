<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { resealInvite } from '$lib/partner-sealing';
	import { storedNamesFrom, type ViewerNames } from '$lib/partnership';
	import { type PartnerInviteFormValues, partnerAcceptFormSchema } from '$lib/schemas/partnerForm';
	import { replaceWithSealed } from '$lib/sealed-forms';
	import { superForm } from '$lib/superform';
	import PartnerFields from './PartnerFields.svelte';

	/**
	 * The accept half of the invite page.
	 *
	 * Its own component rather than a branch of `{#if}` in the page, because
	 * `superForm()` has to be called exactly once for the life of the form — an
	 * `{@const}` inside a conditional block re-runs it whenever the branch
	 * re-renders and silently throws away the field state.
	 */
	let {
		data,
		editable,
		names,
		invite,
		children
	}: {
		data: SuperValidated<PartnerInviteFormValues>;
		editable: boolean;
		/** The names as the accepter sees them, opened from the invite on the page. */
		names: ViewerNames;
		/** What re-sealing an edit takes: the invite's id and key, and the inviter's recipient. */
		invite: { partnershipId: string; key: Uint8Array<ArrayBuffer>; inviterRecipient: string };
		children?: Snippet;
	} = $props();

	const TEXT_FIELDS = ['partnerName', 'yourName', 'partnerRole', 'yourRole'] as const;

	let problem = $state<string | null>(null);

	// svelte-ignore state_referenced_locally
	// Captures the load's initial `data` on purpose: `superForm` registers its
	// lifecycle once, and re-running it on every `invalidate()` would reset the
	// form. The stores it returns are the live connection. The page mounts this
	// only once the invite is open, so the names are in it from the start.
	// A distinct id, because the content is merged into a copy: superforms
	// recognises its initial form by identity, so the original still in
	// `page.data` under the same id would read as an update and be written
	// over the opened content as soon as the page store ticked.
	const superform = superForm(
		{ ...data, id: `${data.id}:opened`, data: { ...data.data, ...names } },
		{
			validators: zod4Client(partnerAcceptFormSchema),
			async onSubmit({ formData, cancel }) {
				problem = null;
				if (!editable) {
					// Read-only: the server keeps the names as the inviter left them
					// and ignores anything posted, so nothing of them is posted at all.
					replaceWithSealed(formData, TEXT_FIELDS, {});
					return;
				}
				// superforms validates after `onSubmit`, and this seals what it
				// validated, so it validates first itself.
				const checked = await superform.validateForm({ update: true });
				if (!checked.valid) {
					cancel();
					return;
				}
				// The accepter is the invitee. Sealed again under the same invite key:
				// there is no partnership vault yet (docs/partners.md).
				const sealed = await resealInvite(
					invite.partnershipId,
					invite.key,
					storedNamesFrom(checked.data, 'invitee'),
					invite.inviterRecipient
				);
				replaceWithSealed(formData, TEXT_FIELDS, sealed);
			},
			onResult({ result, cancel }) {
				// A refusal is a message: there are no fields of the server's to send
				// back, so it is shown here and what was typed is kept.
				if (result.type === 'failure') {
					cancel();
					problem =
						typeof result.data?.error === 'string'
							? result.data.error
							: 'That could not be saved. Reload the page and try again.';
				}
			}
		}
	);
	const { errors, submitting } = superform;
</script>

<!-- The submit button lives outside the form, on a shared row with the
     "Not now" link the page passes in via the default slot — `form="partner-accept"`
     re-associates it, so it still submits through superforms' enhance. -->
<form id="partner-accept" method="POST" use:superform.enhance>
	<PartnerFields {superform} {editable} />
</form>

<div class="actions">
	<!-- `disabled={x}`, never `disabled={x || undefined}`. Once Web Awesome
	     upgrades the element Svelte assigns to the `disabled` *property*, and
	     this alpha coerces `undefined` to true — leaving the button permanently
	     disabled. A plain boolean assigns false and behaves. -->
	<!-- Brand and solid: the page's one action, valid as it arrives (the
	     fields come filled in from the invite). It was Web Awesome's default
	     neutral, the only primary action on the public pages not in amber. -->
	<wa-button
		type="submit"
		form="partner-accept"
		variant="brand"
		appearance="accent"
		disabled={$submitting}>Accept and link</wa-button
	>
	{#if $errors._errors}<span class="invalid">{$errors._errors}</span>{/if}
	{#if problem}<span class="invalid" role="alert">{problem}</span>{/if}
	{@render children?.()}
</div>

<style>
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;

		.invalid {
			color: var(--wa-color-text-danger);
		}
	}
</style>
