<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, untrack } from 'svelte';
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import { unlockedIdentity } from '$lib/crypto/session.svelte';
	import { type DraftScope, type DraftSession, openDraft } from '$lib/messaging/drafts';
	import { dreamTextFormSchema } from '$lib/schemas/dreamTextForm';
	import { superForm } from '$lib/superform';

	/**
	 * One of the new engine's text boxes, keeping an encrypted draft on the
	 * device until what it holds is sent (AGENTS.md, "Never lose something a
	 * user typed"). `onsend` answers whether it was taken; the box empties
	 * only then.
	 */
	let {
		id,
		label,
		placeholder = '',
		max,
		draft: scope,
		submitLabel,
		disabled = false,
		rows = 2,
		initial = '',
		onsend,
		actions
	}: {
		id: string;
		label: string;
		placeholder?: string;
		max: number;
		draft: DraftScope;
		submitLabel: string;
		disabled?: boolean;
		rows?: number;
		/** What the box starts with when there is no draft: the passage being edited. */
		initial?: string;
		onsend: (text: string) => Promise<boolean>;
		/** More buttons beside the submit one. */
		actions?: Snippet;
	} = $props();

	let draft: DraftSession | null = null;

	// svelte-ignore state_referenced_locally
	const schema = dreamTextFormSchema(max);
	// svelte-ignore state_referenced_locally
	const superform = superForm(defaults({ text: initial }, zod4Client(schema), { id }), {
		SPA: true,
		applyAction: false,
		invalidateAll: false,
		resetForm: false,
		validators: zod4Client(schema),
		async onUpdate({ form: submitted }) {
			if (!submitted.valid) {
				return;
			}
			if (await onsend(submitted.data.text)) {
				$form.text = '';
				draft?.clear();
			}
		}
	});
	const { form, enhance, submitting, tainted, allErrors } = superform;

	onMount(() => {
		void openDraft(
			untrack(() => scope),
			unlockedIdentity()
		).then((session) => {
			draft = session;
			if (session.initial && !$form.text) {
				$form.text = session.initial.text;
			}
		});
	});

	$effect(() => {
		draft?.save({ text: $form.text, tagIds: [] });
	});

	const ready = $derived(Boolean($tainted) && $form.text.trim() !== '' && $allErrors.length === 0);
</script>

<form method="POST" use:enhance class="text-box">
	<InputField {superform} field="text" type="textarea" title={label} {placeholder} {rows} maxlength={max} />
	<div class="actions">
		{@render actions?.()}
		<!-- Outlined until there is something to send (AGENTS.md, "Save buttons"). -->
		<wa-button
			type="submit"
			appearance={ready ? 'accent' : 'outlined'}
			variant={ready ? 'brand' : 'neutral'}
			disabled={disabled || $submitting}
		>
			{submitLabel}
		</wa-button>
	</div>
</form>

<style>
	.text-box {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--wa-space-xs);
	}
</style>
