<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import RadioButton from '$lib/components/segmented/RadioButton.svelte';
	import RadioButtonGroup from '$lib/components/segmented/RadioButtonGroup.svelte';
	import { unlockedIdentity } from '$lib/crypto/session.svelte';
	import { type DraftSession, openDraft } from '$lib/messaging/drafts';
	import {
		type DreamPreferenceForm,
		dreamPreferenceFormSchema
	} from '$lib/schemas/dreamPreferenceForm';
	import { superForm } from '$lib/superform';

	/**
	 * Adding one of the user's own preferences: what it is, how firm, and
	 * optionally the kind of daydream it is for. A "Never" one is a limit.
	 * What is typed keeps an encrypted draft until it is added.
	 */
	let { onadd }: { onadd: (preference: DreamPreferenceForm) => Promise<boolean> } = $props();

	let draft: DraftSession | null = null;

	const start: DreamPreferenceForm = { text: '', firmness: 'hard', appliesTo: '' };
	const superform = superForm(
		defaults(start, zod4Client(dreamPreferenceFormSchema), {
			id: 'dream-preference'
		}),
		{
			SPA: true,
			applyAction: false,
			invalidateAll: false,
			resetForm: false,
			dataType: 'json',
			validators: zod4Client(dreamPreferenceFormSchema),
			async onUpdate({ form: submitted }) {
				if (submitted.valid && (await onadd(submitted.data))) {
					// `submitted` too: superforms writes it back into the form once
					// this returns, which put the words straight back.
					$form.text = '';
					$form.appliesTo = '';
					submitted.data.text = '';
					submitted.data.appliesTo = '';
					draft?.clear();
				}
			}
		}
	);
	const { form, enhance, submitting, tainted, allErrors } = superform;

	onMount(() => {
		void openDraft({ kind: 'dream-limit' }, untrack(unlockedIdentity)).then((session) => {
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

<form method="POST" use:enhance class="preference-form">
	<RadioButtonGroup label="How firm" bind:value={$form.firmness}>
		<RadioButton value="hard">Never</RadioButton>
		<RadioButton value="default">By default</RadioButton>
		<RadioButton value="leaning">Usually</RadioButton>
	</RadioButtonGroup>
	<InputField {superform} field="text" type="text" title="Add a preference" placeholder="Older, composed characters" />
	<InputField
		{superform}
		field="appliesTo"
		type="text"
		title="Only for (optional)"
		placeholder="training stories"
		required={false}
	/>
	<div class="actions">
		<!-- Outlined until there is something to add (AGENTS.md, "Save buttons"). -->
		<wa-button
			type="submit"
			appearance={ready ? 'accent' : 'outlined'}
			variant={ready ? 'brand' : 'neutral'}
			disabled={$submitting}
		>
			Add
		</wa-button>
	</div>
</form>

<style>
	.preference-form {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
