<script lang="ts">
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import PartnerFields from '$lib/components/PartnerFields.svelte';
	import { inviteFragment } from '$lib/crypto/invite';
	import { sealInvite } from '$lib/partner-sealing';
	import { storedNamesFrom } from '$lib/partnership';
	import { partnerInviteFormSchema } from '$lib/schemas/partnerForm';
	import { replaceWithSealed } from '$lib/sealed-forms';
	import { shareInviteLink } from '$lib/share';
	import { superForm } from '$lib/superform';
	import type { InviteCreated } from './+page.server';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = resolve('/(auth-required)/(app)/settings/partners');

	let problem = $state<string | null>(null);
	/**
	 * The invite's id and key, made once and kept across attempts, so a retry
	 * after a lost response is refused as a taken id rather than making a
	 * second invite.
	 */
	let pending: { id: string; key: Uint8Array<ArrayBuffer> } | null = null;

	// svelte-ignore state_referenced_locally
	// Captures the load's initial `data.partnerInviteForm` on purpose:
	// `superForm` registers its lifecycle once, and re-running it on every
	// `invalidate()` would reset the form.
	const superform = superForm(data.partnerInviteForm, {
		resetForm: false,
		validators: zod4Client(partnerInviteFormSchema),
		async onSubmit({ formData, cancel }) {
			problem = null;
			// superforms validates after `onSubmit`, and this seals what it
			// validated, so it validates first itself.
			const checked = await superform.validateForm({ update: true });
			if (!checked.valid) {
				cancel();
				return;
			}
			const id = pending?.id ?? crypto.randomUUID();
			const sealed = await sealInvite(id, storedNamesFrom(checked.data, 'inviter'));
			if (!sealed.ok) {
				({ error: problem } = sealed);
				cancel();
				return;
			}
			pending = { id, key: sealed.key };
			replaceWithSealed(formData, ['partnerName', 'yourName', 'partnerRole', 'yourRole'], {
				id,
				...sealed.fields
			});
		},
		// The action returns the link instead of redirecting, so this page owns
		// the navigation. See the comment on the action.
		async onResult({ result, cancel }) {
			if (result.type === 'failure') {
				cancel();
				problem =
					typeof result.data?.error === 'string'
						? result.data.error
						: 'That invite could not be made. Reload and try again.';
				return;
			}
			if (result.type !== 'success' || !pending) {
				return;
			}
			cancel();
			const created = result.data?.created as InviteCreated | undefined;
			if (!created) {
				return;
			}
			// The key goes in the fragment, which no server ever sees: the link
			// opens the names, and the server's copy of the invite does not.
			const link = `${created.url}${inviteFragment(pending.key)}`;

			// Started, deliberately NOT awaited. The share sheet has to open inside
			// the click's transient user activation, but it stays open until the
			// user picks something — awaiting it would leave the page frozen
			// mid-submit for as long as they took, and forever on a platform whose
			// share promise never settles. A client-side navigation does not
			// dismiss a browser-level sheet, so both can happen at once.
			void shareInviteLink(link);
			await goto(
				resolve('/(auth-required)/(app)/settings/partners/[id]', { id: created.partnershipId })
			);
		}
	});
	const { errors, form, submitting } = superform;
	// Solid once there is a valid invite to make (AGENTS.md's save-button
	// rule). Validity alone: the name it needs cannot be there untouched.
	const canCreate = $derived(partnerInviteFormSchema.safeParse($form).success);
</script>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to partners"
		backText="Partners"
		title="Add a partner"
		description="Answer these, then you will get a link to send them. Nothing is shared until they accept it."
	/>

	<div class="content">
		<form method="POST" use:superform.enhance>
			<PartnerFields {superform} />

			<!-- `disabled={$submitting}`, never `disabled={$submitting || undefined}`:
		     once Web Awesome upgrades the element Svelte assigns to the `disabled`
		     *property*, and this alpha coerces `undefined` to true, which leaves the
		     button permanently disabled. -->
			<div class="actions">
				<wa-button
					type="submit"
					appearance={canCreate ? 'accent' : 'outlined'}
					variant={canCreate ? 'brand' : undefined}
					disabled={$submitting}>Create invite link</wa-button
				>
				<a class="cancel" href={resolve('/(auth-required)/(app)/settings/partners')}>Cancel</a>
			</div>
			{#if $errors._errors}<span class="invalid">{$errors._errors}</span>{/if}
			{#if problem}<span class="invalid" role="alert">{problem}</span>{/if}
		</form>
	</div>
</section>

<style>
	section {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		padding-bottom: var(--wa-space-l);
		width: 100%;

		.content {
			padding: var(--wa-space-l) var(--page-gutter);
		}

		form {
			display: flex;
			flex-direction: column;
			gap: 1rem;

			.invalid {
				color: var(--wa-color-text-danger);
			}

			.actions {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.75rem;
			}

			.cancel {
				text-align: center;
				color: var(--wa-color-text-quiet);
			}
		}
	}
</style>
