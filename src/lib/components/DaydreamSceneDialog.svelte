<script lang="ts">
	import { onMount } from 'svelte';
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import {
		DAYDREAM_LIMITS,
		type DaydreamSceneCopy,
		EMPTY_SCENE,
		SCENE_TEXT_FIELDS,
		type SceneTextField
	} from '$lib/daydream';
	import { SCENE_CHIPS, SCENE_FIELD_LABELS, SCENE_TEMPLATES } from '$lib/daydream/catalog';
	import { saveLibraryItem } from '$lib/daydream/client';
	import {
		type SuggestContext,
		suggestChips,
		suggestFill,
		surpriseScene
	} from '$lib/daydream/suggest';
	import { type DaydreamSceneFormValues, daydreamSceneFormSchema } from '$lib/schemas/daydreamForm';
	import { superForm } from '$lib/superform';
	import type { SealedRefView } from '$lib/types';
	import DaydreamChipField from './DaydreamChipField.svelte';

	/**
	 * Making or changing a scene, in a dialog, the way
	 * `DaydreamCharacterDialog` makes a character: starting points, chips
	 * under every field, the model's ideas when suggestions are on, and the
	 * free text the truth. With `surprise`, the model writes the whole scene
	 * first — from the characters, the limits and the dials — and it opens
	 * here to read, change, or try again before it is used.
	 *
	 * An SPA superform saving through `api/daydreams/scenes`, for the reason
	 * the character dialog gives.
	 */
	let {
		scene = null,
		libraryRevision = null,
		surprise = false,
		context,
		suggestionsOn,
		onsaved,
		onclose
	}: {
		scene?: DaydreamSceneCopy | null;
		libraryRevision?: number | null;
		/** Start with a scene the model makes up ("Surprise me"). */
		surprise?: boolean;
		context: SuggestContext;
		suggestionsOn: boolean;
		onsaved: (scene: DaydreamSceneCopy, sealed?: SealedRefView) => void;
		onclose: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	const existing = scene;
	// svelte-ignore state_referenced_locally
	const knownRevision = libraryRevision;
	// svelte-ignore state_referenced_locally
	const surprising = surprise;
	const inLibrary = existing?.sourceId !== null && knownRevision !== null;

	const start: DaydreamSceneFormValues = existing
		? {
				title: existing.title,
				setting: existing.setting,
				premise: existing.premise,
				yourRole: existing.yourRole,
				tone: existing.tone,
				notes: existing.notes,
				saveToLibrary: inLibrary
			}
		: { ...EMPTY_SCENE, saveToLibrary: true };

	let problem: string | null = $state(null);
	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();

	const superform = superForm(defaults(start, zod4Client(daydreamSceneFormSchema)), {
		SPA: true,
		// Nothing for the page to apply or reload: the dialog saves through the
		// API and hands the result back. Left on, superforms re-runs the page's
		// loads, and the setup form underneath — whose empty initial form is
		// still in `page.data` under the same id — was reset to it, losing the
		// character that had just been added.
		applyAction: false,
		invalidateAll: false,
		resetForm: false,
		validators: zod4Client(daydreamSceneFormSchema),
		async onUpdate({ form: submitted }) {
			problem = null;
			if (!submitted.valid) {
				return;
			}
			const { saveToLibrary, ...fields } = submitted.data;
			const content = { ...fields, title: fields.title.trim(), premise: fields.premise.trim() };
			if (!saveToLibrary) {
				onsaved({ ...content, sourceId: null, sourceRevision: null });
				close();
				return;
			}
			const id = inLibrary && existing?.sourceId ? existing.sourceId : crypto.randomUUID();
			const saved = await saveLibraryItem('scenes', {
				id,
				content,
				expectedRevision: inLibrary ? knownRevision : null
			});
			if (!saved.ok) {
				problem = saved.error;
				return;
			}
			onsaved({ ...content, sourceId: id, sourceRevision: saved.revision }, saved.sealed);
			close();
		}
	});

	const { form, errors, submitting, tainted, isTainted } = superform;

	function close() {
		if (dialog) {
			dialog.open = false;
		}
	}

	const canSave = $derived(
		(existing === null || isTainted($tainted)) && daydreamSceneFormSchema.safeParse($form).success
	);

	const draft = $derived(
		Object.fromEntries(
			(['title', ...SCENE_TEXT_FIELDS] as const).map((field) => [field, $form[field]])
		) as Record<string, string>
	);

	const empty = $derived(
		$form.title.trim() === '' && SCENE_TEXT_FIELDS.every((field) => $form[field].trim() === '')
	);

	function useTemplate(id: string) {
		const template = SCENE_TEMPLATES.find((entry) => entry.id === id);
		if (template) {
			$form = { ...$form, ...template.scene };
		}
	}

	let thinking = $state(false);

	/** A whole scene from the model, in place of what is in the form. */
	async function makeOneUp() {
		thinking = true;
		problem = null;
		const answer = await surpriseScene(context);
		thinking = false;
		if (answer.ok) {
			$form = { ...$form, ...answer.value };
		} else {
			problem = answer.error;
		}
	}

	onMount(() => {
		if (surprising) {
			void makeOneUp();
		}
	});

	async function fillTheRest() {
		thinking = true;
		problem = null;
		const answer = await suggestFill({ target: 'scene', draft, context });
		thinking = false;
		if (!answer.ok) {
			problem = answer.error;
			return;
		}
		const next = { ...$form };
		for (const field of ['title', ...SCENE_TEXT_FIELDS] as const) {
			const text = answer.value[field];
			if (text && next[field].trim() === '') {
				next[field] = text;
			}
		}
		$form = next;
	}

	function moreIdeas(field: SceneTextField) {
		return () => suggestChips({ target: 'scene', field, draft, context });
	}

	function labelFor(): string {
		if (surprising) {
			return 'A surprise';
		}
		return existing ? `Change “${existing.title}”` : 'A new scene';
	}
	const dialogLabel = labelFor();

	const LIMIT_OF: Record<SceneTextField, number> = {
		setting: DAYDREAM_LIMITS.setting,
		premise: DAYDREAM_LIMITS.premise,
		yourRole: DAYDREAM_LIMITS.yourRole,
		tone: DAYDREAM_LIMITS.tone,
		notes: DAYDREAM_LIMITS.sceneNotes
	};
</script>

<wa-dialog
	bind:this={dialog}
	class="scene-dialog"
	label={dialogLabel}
	open
	onwa-after-hide={(event: Event) => event.target === dialog && onclose()}
>
	<form method="POST" use:superform.enhance class="fields">
		{#if surprising}
			<div class="surprise">
				<p class="hint">
					{thinking ? 'Making one up…' : 'Read it, change anything, or ask for another.'}
				</p>
				<wa-button size="s" appearance="outlined" disabled={thinking} onclick={makeOneUp}>
					<wa-icon slot="start" name="shuffle" variant="solid"></wa-icon>
					Try another
				</wa-button>
			</div>
		{:else if !existing && empty}
			<section aria-label="Start from">
				<p class="hint">Start from one of these, or from nothing.</p>
				<div class="template-list">
					{#each SCENE_TEMPLATES as template (template.id)}
						<wa-button size="s" appearance="outlined" onclick={() => useTemplate(template.id)}>
							{template.label}
						</wa-button>
					{/each}
				</div>
			</section>
		{/if}

		<InputField
			{superform}
			field="title"
			type="text"
			title="Call it"
			maxlength={DAYDREAM_LIMITS.title}
			required
		/>

		{#each SCENE_TEXT_FIELDS as field (field)}
			<DaydreamChipField
				label={SCENE_FIELD_LABELS[field].label}
				hint={SCENE_FIELD_LABELS[field].hint}
				value={$form[field]}
				limit={LIMIT_OF[field]}
				chips={SCENE_CHIPS[field]}
				rows={field === 'premise' ? 4 : 2}
				onchange={(text) => {
					$form[field] = text;
				}}
				onMoreIdeas={suggestionsOn ? moreIdeas(field) : undefined}
			/>
			{#if $errors[field]}<span class="invalid">{$errors[field]}</span>{/if}
		{/each}

		{#if suggestionsOn && !surprising}
			<wa-button class="fill" size="s" appearance="outlined" disabled={thinking} onclick={fillTheRest}>
				<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>
				{thinking ? 'Filling in…' : 'Fill in the rest'}
			</wa-button>
		{/if}

		<label class="save-to-library">
			<input type="checkbox" bind:checked={$form.saveToLibrary} />
			<span>Save to my scenes, to use in other daydreams</span>
		</label>
		{#if inLibrary && $form.saveToLibrary}
			<p class="hint">This changes it in your library too.</p>
		{/if}

		{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}

		<div class="buttons">
			<wa-button appearance="plain" onclick={close}>Cancel</wa-button>
			<wa-button
				type="submit"
				appearance={canSave ? 'filled' : 'outlined'}
				variant={canSave ? 'brand' : 'neutral'}
				disabled={$submitting || thinking}
			>
				{existing ? 'Save changes' : 'Use this scene'}
			</wa-button>
		</div>
	</form>
</wa-dialog>

<style>
	.scene-dialog {
		--width: min(40rem, 100vw);
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.surprise {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.template-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.hint {
		margin: 0 0 0.375rem;
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}

	.fill {
		align-self: flex-start;
	}

	.save-to-library {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.buttons {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
