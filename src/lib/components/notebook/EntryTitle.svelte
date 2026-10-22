<script lang="ts">
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import type { Transaction, Text as YText, YTextEvent } from 'yjs';
	import { z } from 'zod';
	import InputField from '$lib/components/InputField.svelte';
	import { NOTEBOOK_LIMITS } from '$lib/notebook';
	import { textChange } from '$lib/notebook/text-diff';
	import { superForm } from '$lib/superform';

	/**
	 * An entry's title, as a field bound to the shared `Y.Text` it lives in, so
	 * two people typing in it merge rather than overwrite each other.
	 *
	 * A superform only because the app's fields are (`InputField`): it is never
	 * submitted. What is typed goes into the document as the smallest edit
	 * (`textChange`), and what arrives from elsewhere comes back out into the
	 * field.
	 */
	let { text, readOnly, placeholder }: { text: YText; readOnly: boolean; placeholder: string } =
		$props();

	const schema = z.object({ title: z.string().max(NOTEBOOK_LIMITS.title) });

	/**
	 * Present only when true. `readonly={false}` is set as an attribute on an
	 * element cloned from a template before it upgrades, and Lit reads any
	 * `readonly` attribute, `"false"` included, as true: the title could never
	 * be typed in. The same trap AGENTS.md describes for `loading`.
	 */
	const readOnlyAttribute = $derived(readOnly ? { readonly: true } : {});

	// svelte-ignore state_referenced_locally
	// Captured once, as every superform is: the stores are the live connection,
	// and the text it binds to is fixed for the life of the page.
	const superform = superForm(
		defaults({ title: text.toString() }, zod4Client(schema), { id: 'notebook-title' }),
		{ SPA: true, resetForm: false, validators: zod4Client(schema) }
	);
	const { form } = superform;

	$effect(() => {
		const shared = text;
		// What the document says changed under the field, from anyone but this
		// field: put it in the field.
		const observe = (_event: YTextEvent, transaction: Transaction) => {
			if (transaction.origin === superform) {
				return;
			}
			const next = shared.toString();
			form.update((current) => (current.title === next ? current : { ...current, title: next }), {
				taint: false
			});
		};
		shared.observe(observe);
		return () => shared.unobserve(observe);
	});

	$effect(() => {
		const typed = $form.title;
		const shared = text;
		if (readOnly) {
			return;
		}
		const change = textChange(shared.toString(), typed);
		if (!change) {
			return;
		}
		shared.doc?.transact(() => {
			if (change.remove > 0) {
				shared.delete(change.index, change.remove);
			}
			if (change.insert) {
				shared.insert(change.index, change.insert);
			}
		}, superform);
	});
</script>

<form class="entry-title" onsubmit={(event) => event.preventDefault()}>
	<InputField
		{superform}
		field="title"
		type="text"
		title="Title"
		class="wa-visually-hidden-label"
		{placeholder}
		{...readOnlyAttribute}
		maxlength={NOTEBOOK_LIMITS.title}
		autocomplete="off"
	/>
</form>

<style>
	/* The title reads as the entry's heading, not a form field: no visible
	   label (it stays the field's accessible name, hidden by Web Awesome's
	   utility class), and no inset or border, so its first letter sits on the
	   same edge as the text of the entry below it. */
	.entry-title {
		--wa-form-control-border-color: transparent;
		--wa-form-control-border-width: 0;
		--wa-form-control-background-color: transparent;
		--wa-form-control-padding-inline: 0;
		font-family: var(--wa-font-family-heading);
		font-size: var(--wa-font-size-xl);
	}

	.entry-title :global(wa-input::part(input)) {
		font-size: var(--wa-font-size-xl);
		font-weight: var(--wa-font-weight-bold);
	}
</style>
