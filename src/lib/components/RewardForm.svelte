<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import { reportRequestFailure } from '$lib/request-failure.svelte';
	import { DOCUMENT_FEATURES } from '$lib/richtext-editor';
	import { replaceWithSealed, type SealScope, sealForSubmit } from '$lib/sealed-forms';
	import { rewardKind } from '$lib/sealed-kinds/tasks';

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
		reward = null
	}: {
		values: RewardFormValues;
		submitLabel: string;
		sealScope: SealScope;
		/** The reward being edited; null to create one. */
		reward?: { id: string; revision: number } | null;
	} = $props();

	let problem = $state<string | null>(null);
	/** As on `SealedTaskEditor`: kept across attempts, so a retry cannot create the reward twice. */
	let newId: string | null = null;

	/**
	 * Seals the title and description before the form leaves the page, and
	 * posts the sealed record in their place (`sealed-forms.ts`). Not
	 * superforms: this form has always posted natively, and the only thing the
	 * action sends back now is a message.
	 */
	const sealOnSubmit: SubmitFunction = async ({ formData, cancel }) => {
		problem = null;
		const title = formData.get('title');
		newId ??= crypto.randomUUID();
		const outcome = await sealForSubmit(rewardKind, {
			scope: sealScope,
			recordId: reward?.id ?? newId,
			payload: { title: typeof title === 'string' ? title : '', description },
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
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				problem =
					typeof result.data?.error === 'string'
						? result.data.error
						: 'That reward could not be saved. Reload and try again.';
			} else if (result.type === 'error') {
				reportRequestFailure(result.error);
			} else {
				await update();
			}
		};
	};

	/**
	 * The editor's document, which `sealOnSubmit` seals with the title. Still
	 * carried by a hidden input too, so the form's fields are all in one place
	 * when it is read; that input is removed from what is posted.
	 */
	// svelte-ignore state_referenced_locally
	let description = $state(values.description);

	/*
	 * The native fields are seeded with `defaultValue` / `defaultChecked`, not
	 * `value` / `checked`, because nothing here holds them in state: the server's values
	 * are where the fields start, not something to hold them to.
	 *
	 * `value={…}` lost what the user typed. Svelte does not write an input's
	 * value while hydrating, so it has no record of having set it — and the first
	 * time this template's effect re-ran for any reason, it wrote `values.title`
	 * over the field. Typing in the description is such a reason: it updates the
	 * hidden input below, in the same effect. So on a page loaded in full, a
	 * title typed before the description was erased (the add page) or reverted to
	 * the stored one (the edit pages). A client-side navigation mounts rather
	 * than hydrates, which is why it only showed on a refresh, a direct link, or
	 * a slow page — first seen as a flaky e2e run.
	 */
</script>

<form method="POST" class="panel reward-form add-form" use:enhance={sealOnSubmit}>
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
	<label>
		<span>Title</span>
		<input name="title" maxlength="80" required defaultValue={values.title} />
	</label>
	<label>
		<span>Description</span>
		<input type="hidden" name="description" value={description} />
		<div class="richtext-field">
			<RichTextEditor
				value={values.description}
				onChange={(next) => { description = next; }}
				features={DOCUMENT_FEATURES}
				toolbar
				placeholder="What is this reward?"
				ariaLabel="Description"
			/>
		</div>
	</label>
	<div class="editor-row">
		<label>
			<span>Cost</span>
			<input type="number" min="0" step="1" name="cost" required defaultValue={values.cost} />
		</label>
		<label class="checkbox">
			<input type="checkbox" name="active" defaultChecked={values.active} />
			<span>Active</span>
		</label>
	</div>
	<wa-button type="submit">{submitLabel}</wa-button>
</form>

<style>
	.panel {
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-panel-border-radius);
		padding: var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.editor-row {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	input:not([type='hidden']) {
		width: 100%;
		box-sizing: border-box;
		padding: 0.6rem 0.75rem;
		border-radius: 0.6rem;
		border: 1px solid var(--wa-color-surface-border);
		font: inherit;
	}

	.richtext-field {
		inline-size: 100%;
		box-sizing: border-box;
		min-block-size: 4.5rem;
		max-block-size: 40svh;
		overflow-y: auto;
		padding: 0.6rem 0.75rem;
		border-radius: 0.6rem;
		border: 1px solid var(--wa-color-surface-border);
		font: inherit;
	}

	.richtext-field:focus-within {
		outline: 2px solid var(--wa-color-brand-fill-loud, currentColor);
		outline-offset: -1px;
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}

	.checkbox {
		flex-direction: row;
		align-items: center;

		input {
			width: auto;
		}
	}
</style>
