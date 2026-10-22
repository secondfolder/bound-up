<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidateAll } from '$app/navigation';
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import { DOCUMENT_FEATURES } from '$lib/richtext-editor';
	import { rewardEditorFormSchema } from '$lib/schemas/rewardForm';
	import { replaceWithSealed, type SealScope, sealForSubmit } from '$lib/sealed-forms';
	import { rewardKind } from '$lib/sealed-kinds/tasks';
	import { superForm } from '$lib/superform';

	type RewardFormValues = {
		title: string;
		description: string;
		cost: string | number;
		active: boolean;
	};

	let {
		values,
		submitLabel,
		sealScope,
		reward = null,
		action,
		onsaved
	}: {
		values: RewardFormValues;
		submitLabel: string;
		sealScope: SealScope;
		/** The reward being edited; null to create one. */
		reward?: { id: string; revision: number } | null;
		/**
		 * Where it posts, when that is not the page it is on: the add or edit
		 * route's action, from a sheet over the rewards list.
		 */
		action?: string;
		/** Called once it has saved, instead of following the action's redirect. */
		onsaved?: () => void;
	} = $props();

	let problem = $state<string | null>(null);
	/** As on `SealedTaskEditor`: kept across attempts, so a retry cannot create the reward twice. */
	let newId: string | null = null;

	/**
	 * A superform built in the browser from `defaults()`, not from a load's
	 * `superValidate`: the reward's actions never read a superform. The title
	 * and description are sealed here and posted as a sealed record in their
	 * place (`sealed-forms.ts`), which the action parses with
	 * `rewardSealedSubmitSchema`, and it answers a refusal with a message
	 * rather than a form. What this gives the page is the app's fields
	 * (InputField and friends), client-side validation and the save
	 * convention, from the same values the pages already pass.
	 */
	// svelte-ignore state_referenced_locally
	// Captured once on purpose, as on every superform: the stores are the live
	// connection. The edit pages mount this only once the reward is opened, so
	// its content is here from the start.
	const superform = superForm(
		defaults(
			{
				title: values.title,
				description: values.description,
				cost: String(values.cost),
				active: values.active
			},
			zod4Client(rewardEditorFormSchema),
			{ id: reward ? `reward-${reward.id}` : 'reward-new' }
		),
		{
			resetForm: false,
			validators: zod4Client(rewardEditorFormSchema),
			async onSubmit({ formData, cancel }) {
				problem = null;
				// superforms validates after `onSubmit`, and this seals what it
				// validated, so it validates first itself.
				const checked = await superform.validateForm({ update: true });
				if (!checked.valid) {
					cancel();
					return;
				}
				newId ??= crypto.randomUUID();
				const outcome = await sealForSubmit(rewardKind, {
					scope: sealScope,
					recordId: reward?.id ?? newId,
					payload: { title: checked.data.title, description: checked.data.description },
					describe: (field) =>
						field === 'description'
							? 'Please keep the description to 500 characters or fewer'
							: 'Please enter a reward title of 80 characters or fewer'
				});
				if (!outcome.ok) {
					({ error: problem } = outcome);
					cancel();
					return;
				}
				replaceWithSealed(formData, ['title', 'description'], {
					...outcome.fields,
					...(reward ? { expectedRevision: String(reward.revision) } : {})
				});
			},
			async onResult({ result, cancel }) {
				// Saved, in a sheet: the list under it is refreshed and the sheet
				// closes, rather than the action's redirect navigating to the page
				// the viewer is already on.
				if (onsaved && (result.type === 'redirect' || result.type === 'success')) {
					cancel();
					await invalidateAll();
					onsaved();
					return;
				}
				// A refusal is a message, not a superform: there are no fields of the
				// server's to send back, so it is shown here and the form kept as typed.
				if (result.type === 'failure') {
					cancel();
					problem =
						typeof result.data?.error === 'string'
							? result.data.error
							: 'That reward could not be saved. Reload and try again.';
				}
			}
		}
	);
	const { form, errors, submitting } = superform;

	/**
	 * "Unsaved changes", as on TaskForm: a comparison with a baseline that is
	 * taken again once the description's editor has settled, because the
	 * editor can normalise its document as it mounts, which is not an edit and
	 * would otherwise light the save button on a form nobody has touched.
	 */
	// svelte-ignore state_referenced_locally
	let initialValues = $state(structuredClone(superform.capture().data));
	let mounted = $state(false);
	let userEdited = $state(false);

	onMount(() => {
		mounted = true;
		void tick().then(() => {
			if (!userEdited) {
				initialValues = structuredClone(superform.capture().data);
			}
		});
	});

	function markUserEdited() {
		if (mounted) {
			userEdited = true;
		}
	}

	/** Any edit in the form, heard as TaskForm hears it. */
	const hearEdits: Attachment<HTMLFormElement> = (formElement) => {
		formElement.addEventListener('input', markUserEdited, { capture: true });
		formElement.addEventListener('change', markUserEdited, { capture: true });
		return () => {
			formElement.removeEventListener('input', markUserEdited, { capture: true });
			formElement.removeEventListener('change', markUserEdited, { capture: true });
		};
	};

	function setDescription(stored: string) {
		markUserEdited();
		$form.description = stored;
	}

	/**
	 * The save convention (AGENTS.md): outlined while there is nothing to save,
	 * solid amber once something has changed and would be accepted.
	 */
	const canSave = $derived(
		userEdited &&
			JSON.stringify($form) !== JSON.stringify(initialValues) &&
			rewardEditorFormSchema.safeParse($form).success
	);
</script>

<form
	method="POST"
	{action}
	class="panel reward-form add-form"
	use:superform.enhance
	{@attach hearEdits}
>
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
	<InputField {superform} field="title" title="Title" type="text" maxlength="80" required />
	<div class="description">
		<!-- Not a <label>: the editor is named by its own ariaLabel. -->
		<span class="label" aria-hidden="true">Description</span>
		<input type="hidden" name="description" value={$form.description} />
		<div class="richtext-field">
			<RichTextEditor
				value={$form.description}
				onChange={setDescription}
				features={DOCUMENT_FEATURES}
				toolbar
				placeholder="What is this reward?"
				ariaLabel="Description"
			/>
		</div>
		{#if $errors.description}<span class="invalid">{$errors.description}</span>{/if}
	</div>
	<div class="editor-row">
		<InputField {superform} field="cost" title="Cost" type="number" min="0" step="1" required />
		<CheckboxField {superform} field="active" title="Active" />
	</div>
	<div class="form-footer">
		<!-- `disabled={x}`, never `disabled={x || undefined}`: see AGENTS.md invariant 11. -->
		<wa-button
			type="submit"
			variant={canSave ? 'brand' : 'neutral'}
			appearance={canSave ? 'accent' : 'outlined'}
			disabled={$submitting}>{submitLabel}</wa-button
		>
	</div>
</form>

<style>
	/*
	 * The save button's own footer, stuck to the bottom of the sheet the form
	 * opens in, so it stays in reach however far the form is scrolled. Sticky
	 * inside the sheet's scrolling body rather than in the dialog's footer
	 * slot, so the button stays inside the form and keeps its state (solid
	 * once there is a valid change, disabled while saving) where it is worked
	 * out. The negative margins take it out to the body's edges, over its
	 * padding (`--spacing`, the dialog's), so the fields scroll under a
	 * full-width bar rather than past a floating button.
	 */
	.form-footer {
		position: sticky;
		inset-block-end: calc(-1 * var(--spacing, 0px));
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.5rem;
		margin: 0 calc(-1 * var(--spacing, 0px)) calc(-1 * var(--spacing, 0px));
		padding: var(--wa-space-s) var(--spacing, 0px);
		border-block-start: 1px solid var(--wa-color-surface-border);
		background: var(--wa-color-surface-raised);
	}

	/* Straight in the sheet it opens in (`RouteSheet`), which is the panel: it
	   used to be a bordered, filled card of its own on its own page, and a card
	   inside a sheet was a box in a box. */
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.editor-row {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		align-items: flex-end;

		> :global(*) {
			flex: 1 1 10rem;
		}
	}

	/* The description is a rich-text editor, not a Web Awesome field, so its
	   label and box borrow the form controls' tokens, as on TaskForm. */
	.description {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;

		.label {
			font-weight: var(--wa-form-control-label-font-weight, var(--wa-font-weight-semibold, 600));
			color: var(--wa-form-control-label-color, var(--wa-color-text-normal));
		}
	}

	.richtext-field {
		inline-size: 100%;
		box-sizing: border-box;
		min-block-size: 4.5rem;
		max-block-size: 40svh;
		overflow-y: auto;
		padding: 0.6rem var(--wa-form-control-padding-inline, 0.75rem);
		border-radius: var(--wa-form-control-border-radius);
		border: var(--wa-form-control-border-width, 1px) var(--wa-form-control-border-style, solid)
			var(--wa-form-control-border-color);
		background: var(--wa-form-control-background-color);
	}

	.richtext-field:focus-within {
		outline: var(--wa-focus-ring);
		outline-offset: var(--wa-focus-ring-offset, -1px);
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
