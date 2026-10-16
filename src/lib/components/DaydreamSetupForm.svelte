<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import { DAYDREAM_LEADS, DAYDREAM_LIMITS, DEFAULT_SAFEWORD } from '$lib/daydream';
	import { type DaydreamSetupFormValues, daydreamSetupFormSchema } from '$lib/schemas/daydreamForm';
	import { replaceWithSealed, sealForSubmit } from '$lib/sealed-forms';
	import { type DaydreamSetupContent, daydreamSetupKind } from '$lib/sealed-kinds/daydreams';
	import { superForm } from '$lib/superform';

	/**
	 * A daydream's setup: who the character is, what is going on, and what must
	 * not happen. Sealed in the user's own vault before it is posted, like a
	 * self task (`SealedTaskEditor.svelte`); the action only ever sees the
	 * sealed record.
	 */
	let {
		setupForm,
		daydream = null,
		submitLabel
	}: {
		/** The empty form, as the load prepared it. */
		setupForm: SuperValidated<DaydreamSetupFormValues>;
		/** The daydream being edited, opened; null to create one. */
		daydream?: { id: string; revision: number; setup: DaydreamSetupContent } | null;
		submitLabel: string;
	} = $props();

	/** Every field is sealed, so none is ever posted as it is. */
	const TEXT_FIELDS = [
		'title',
		'characterName',
		'persona',
		'lead',
		'scenario',
		'tone',
		'limits',
		'safeword'
	] as const;

	let problem = $state<string | null>(null);
	/**
	 * A new daydream's id, chosen here because the setup is sealed to it. Kept
	 * across attempts, so a retry after a lost response cannot make the
	 * daydream twice: the second is refused as a taken id.
	 */
	let newId: string | null = null;

	// svelte-ignore state_referenced_locally
	// Captured once on purpose, as on every superform: the stores it returns are
	// the live connection. An edited daydream is mounted only once it is
	// opened, and gets an id of its own for the same reason
	// `SealedTaskEditor` gives one: superforms recognises its initial form by
	// identity, and the empty one still in `page.data` would otherwise be
	// written over the opened content.
	const initial: SuperValidated<DaydreamSetupFormValues> = daydream
		? { ...setupForm, id: `${setupForm.id}:opened`, data: { ...daydream.setup } }
		: setupForm;

	const superform = superForm(initial, {
		resetForm: false,
		validators: zod4Client(daydreamSetupFormSchema),
		async onSubmit({ formData, cancel }) {
			problem = null;
			// superforms validates after `onSubmit`, and this has to seal what it
			// validated, so it validates first itself.
			const checked = await superform.validateForm({ update: true });
			if (!checked.valid) {
				cancel();
				return;
			}
			newId ??= crypto.randomUUID();
			const outcome = await sealForSubmit(daydreamSetupKind, {
				scope: { kind: 'self' },
				recordId: daydream?.id ?? newId,
				payload: checked.data,
				describe: () => 'Please check the form and try again'
			});
			if (!outcome.ok) {
				cancel();
				({ error: problem } = outcome);
				return;
			}
			replaceWithSealed(formData, TEXT_FIELDS, {
				...outcome.fields,
				...(daydream ? { expectedRevision: String(daydream.revision) } : {})
			});
		},
		onResult({ result, cancel }) {
			// The action answers a sealed post with a message or a redirect, never
			// a superform — it has no fields of its to send back — so a refusal is
			// shown here and superforms keeps what was typed.
			if (result.type === 'failure') {
				cancel();
				problem =
					typeof result.data?.error === 'string'
						? result.data.error
						: 'That could not be saved. Reload and try again.';
			}
		}
	});

	const { form, errors, submitting, tainted, isTainted } = superform;

	// The optional fields pass `required={false}` explicitly: superforms marks
	// every field its schema does not call optional as required, an empty
	// string allowed or not, and the browser then refuses to submit the form.

	/** Solid only when there is something valid to save (AGENTS.md, "Save buttons"). */
	const canSave = $derived(isTainted($tainted) && daydreamSetupFormSchema.safeParse($form).success);

	function setText(field: 'persona' | 'scenario' | 'limits', event: Event) {
		$form[field] = (event.currentTarget as HTMLTextAreaElement).value;
	}
</script>

<form method="POST" use:superform.enhance class="panel">
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}

	<InputField
		{superform}
		field="title"
		type="text"
		title="Name this daydream"
		maxlength={DAYDREAM_LIMITS.title}
		required
	/>

	<fieldset>
		<legend>The character</legend>
		<InputField
			{superform}
			field="characterName"
			type="text"
			title="Their name"
			maxlength={DAYDREAM_LIMITS.characterName}
			required
		/>
		<label>
			<span>Who they are, and how they talk</span>
			<textarea
				name="persona"
				rows="4"
				maxlength={DAYDREAM_LIMITS.persona}
				placeholder="Warm but exacting. Speaks softly and expects to be listened to."
				value={$form.persona}
				oninput={(event) => setText('persona', event)}></textarea>
			{#if $errors.persona}<span class="invalid">{$errors.persona}</span>{/if}
		</label>
		<fieldset class="lead">
			<legend>Who leads</legend>
			<div class="choices">
				{#each DAYDREAM_LEADS as choice (choice.value)}
					<label class="choice">
						<input
							type="radio"
							name="lead"
							value={choice.value}
							checked={$form.lead === choice.value}
							onchange={() => {
								$form.lead = choice.value;
							}}
						/>
						<span>{choice.label}</span>
					</label>
				{/each}
			</div>
		</fieldset>
	</fieldset>

	<fieldset>
		<legend>The scene</legend>
		<label>
			<span>The scenario</span>
			<textarea
				name="scenario"
				rows="5"
				maxlength={DAYDREAM_LIMITS.scenario}
				required
				placeholder="Where it starts, and what is going on."
				value={$form.scenario}
				oninput={(event) => setText('scenario', event)}></textarea>
			{#if $errors.scenario}<span class="invalid">{$errors.scenario}</span>{/if}
		</label>
		<InputField
			{superform}
			field="tone"
			type="text"
			title="Tone"
			placeholder="Playful, strict, slow-burn…"
			maxlength={DAYDREAM_LIMITS.tone}
			required={false}
		/>
	</fieldset>

	<fieldset>
		<legend>Your limits</legend>
		<label>
			<span>What must not happen</span>
			<textarea
				name="limits"
				rows="3"
				maxlength={DAYDREAM_LIMITS.limits}
				placeholder="Anything that is off the table."
				value={$form.limits}
				oninput={(event) => setText('limits', event)}></textarea>
			{#if $errors.limits}<span class="invalid">{$errors.limits}</span>{/if}
		</label>
		<InputField
			{superform}
			field="safeword"
			type="text"
			title="A safeword of your own (optional)"
			maxlength={DAYDREAM_LIMITS.safeword}
			required={false}
		/>
		<p class="hint">
			Writing “{DEFAULT_SAFEWORD}”{$form.safeword.trim() ? ` or “${$form.safeword.trim()}”` : ''}
			stops the scene, always.
		</p>
	</fieldset>

	<wa-button
		type="submit"
		appearance={canSave ? 'filled' : 'outlined'}
		variant={canSave ? 'brand' : 'neutral'}
		disabled={$submitting}
	>
		{submitLabel}
	</wa-button>
</form>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 0.6rem;
		padding: 0.75rem;
	}

	legend {
		padding-inline: 0.35rem;
		font-weight: 600;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	textarea {
		inline-size: 100%;
		box-sizing: border-box;
		padding: 0.6rem 0.75rem;
		border-radius: 0.6rem;
		border: 1px solid var(--wa-color-surface-border);
		background: var(--wa-color-surface-lowered, transparent);
		color: inherit;
		font: inherit;
		resize: vertical;
	}

	/* A group of radios is a fieldset, but this one reads as a field rather
	   than as another box inside the box. */
	.lead {
		border: 0;
		padding: 0;
		gap: 0.35rem;

		legend {
			padding: 0;
			font-weight: inherit;
			margin-block-end: 0.35rem;
		}

		.choices {
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem 1.25rem;
		}

		.choice {
			flex-direction: row;
			align-items: center;
			gap: 0.4rem;
		}
	}

	.hint {
		margin: 0;
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
