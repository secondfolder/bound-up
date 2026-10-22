<script lang="ts">
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import InputField from '$lib/components/InputField.svelte';
	import { sealRecord } from '$lib/crypto/sealed';
	import { toBase64 } from '$lib/encryption';
	import { ENTRY_DATE_PATTERN, type NotebookKind } from '$lib/notebook';
	import { loadCollab } from '$lib/notebook/load';
	import { type SealScope, writableVault } from '$lib/sealed-forms';
	import { notebookEntryKind, notebookUpdateKind } from '$lib/sealed-kinds/notebook';
	import { superForm } from '$lib/superform';

	/**
	 * Starts a journal entry or a note, and opens it.
	 *
	 * Nothing typed is posted, because nothing is typed here beyond a journal
	 * entry's date: the form seals an empty title and the entry's first edit
	 * (`firstEdit`, the root paragraph every document needs) and posts those in
	 * a single `entry` field, which `createEntryAction` reads. A client-side
	 * superform, as `RewardForm`'s is, for the app's fields and validation.
	 */
	let {
		kind,
		today,
		sealScope,
		action = '?/create'
	}: { kind: NotebookKind; today: string; sealScope: SealScope; action?: string } = $props();

	const schema = z.object({
		entryDate: z.string().regex(ENTRY_DATE_PATTERN, 'Please choose a date')
	});

	let problem = $state<string | null>(null);
	/** Kept across attempts, so a retry after a lost response cannot create the entry twice. */
	let entryId: string | null = null;

	// svelte-ignore state_referenced_locally
	// Captured once, as every superform is: the stores are the live connection.
	const superform = superForm(
		defaults({ entryDate: today }, zod4Client(schema), { id: `notebook-new-${kind}` }),
		{
			resetForm: false,
			validators: zod4Client(schema),
			async onSubmit({ formData, cancel }) {
				problem = null;
				const checked = await superform.validateForm({ update: true });
				if (kind === 'journal' && !checked.valid) {
					cancel();
					return;
				}
				const writable = await writableVault(sealScope);
				if (typeof writable === 'string') {
					problem = writable;
					cancel();
					return;
				}
				entryId ??= crypto.randomUUID();
				const updateId = crypto.randomUUID();
				// Loaded here rather than with the page: the list never needs the
				// editor or Yjs until someone starts an entry.
				const { firstEdit } = await loadCollab();
				const [header, firstUpdate] = await Promise.all([
					sealRecord(notebookEntryKind, {
						recordId: entryId,
						payload: { title: '', excerpt: '' },
						...writable
					}),
					sealRecord(notebookUpdateKind, {
						recordId: updateId,
						payload: { update: toBase64(await firstEdit()) },
						...writable
					})
				]);
				const vaultId = writable.vault.id;
				formData.delete('entryDate');
				formData.set(
					'entry',
					JSON.stringify({
						id: entryId,
						kind,
						entryDate: kind === 'journal' ? checked.data.entryDate : null,
						header: { vaultId, ...header },
						firstUpdate: { id: updateId, vaultId, ...firstUpdate }
					})
				);
			},
			onResult({ result, cancel }) {
				if (result.type === 'failure') {
					cancel();
					problem =
						typeof result.data?.error === 'string'
							? result.data.error
							: 'That entry could not be created. Reload the page and try again.';
				}
			}
		}
	);
	const { enhance, submitting } = superform;
</script>

<form method="POST" {action} use:enhance class="new-entry">
	{#if kind === 'journal'}
		<InputField {superform} field="entryDate" type="date" title="Date" />
	{/if}
	<wa-button type="submit" variant="brand" appearance="accent" disabled={$submitting}>
		<wa-icon slot="start" name={kind === 'journal' ? 'feather' : 'note-sticky'}></wa-icon>
		{kind === 'journal' ? 'New journal entry' : 'New note'}
	</wa-button>
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
</form>

<style>
	.new-entry {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--wa-space-s);
	}

	.invalid {
		flex-basis: 100%;
		margin: 0;
		color: var(--wa-color-text-danger);
	}
</style>
