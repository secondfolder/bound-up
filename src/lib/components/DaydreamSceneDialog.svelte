<script lang="ts">
	import { onMount } from 'svelte';
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import {
		DAYDREAM_LIMITS,
		type DaydreamSceneCopy,
		type DialValue,
		EMPTY_SCENE,
		MAX_DAYDREAM_CHARACTERS,
		SCENE_PRIMARY_FIELDS,
		SCENE_TEXT_FIELDS,
		type SceneDials,
		type ScenePart,
		type SceneTextField
	} from '$lib/daydream';
	import { SCENE_CHIPS, SCENE_FIELD_LABELS, SCENE_TEMPLATES } from '$lib/daydream/catalog';
	import { saveLibraryItem } from '$lib/daydream/client';
	import { SCENE_SLIDERS, sceneLevel } from '$lib/daydream/dial-words';
	import {
		type SuggestContext,
		suggestChips,
		suggestFill,
		surpriseScene
	} from '$lib/daydream/suggest';
	import type { SuggestedPart } from '$lib/daydream/suggestions';
	import { type DaydreamSceneFormValues, daydreamSceneFormSchema } from '$lib/schemas/daydreamForm';
	import { superForm } from '$lib/superform';
	import type { SealedRefView } from '$lib/types';
	import DaydreamChipField from './DaydreamChipField.svelte';
	import DaydreamOptionalSlider from './DaydreamOptionalSlider.svelte';
	import { startOpen } from './details';

	/**
	 * Making or changing a scene, in a dialog, the way
	 * `DaydreamCharacterDialog` makes a character: starting points, chips
	 * under every field, the model's ideas when suggestions are on, and the
	 * free text the truth. With `surprise`, the model writes the whole scene
	 * first — from the characters, the limits and the dials — and it opens
	 * here to read, change, or try again before it is used.
	 *
	 * Up front: the title, what is going on, how sexual and how kinky it is,
	 * and the parts it has for characters, which is what a daydream casts
	 * them into. Heat and kink are up front because they decide what kind of
	 * story it is — SFW or filthy — more than any other field. The rest is
	 * under "More detail", which starts open when any of it is filled.
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
				parts: existing.parts.map((part) => ({ ...part })),
				dials: { ...existing.dials },
				saveToLibrary: inLibrary
			}
		: { ...EMPTY_SCENE, saveToLibrary: true };

	let problem: string | null = $state(null);
	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();
	let detail: (HTMLElement & { open: boolean }) | undefined = $state();

	const DETAIL_FIELDS = SCENE_TEXT_FIELDS.filter(
		(field) => !(SCENE_PRIMARY_FIELDS as readonly SceneTextField[]).includes(field)
	);
	const detailFilled = (values: Pick<DaydreamSceneFormValues, SceneTextField>) =>
		DETAIL_FIELDS.some((field) => values[field].trim() !== '');
	const startsDetailed = detailFilled(start);

	/** Opens "More detail" when something just wrote into it, so what changed is in view. */
	function revealDetail() {
		if (detail && detailFilled($form)) {
			detail.open = true;
		}
	}

	/** The dials the user has set, with the model's ideas only where they left one unset. */
	const keepSetDials = (suggested: SceneDials): SceneDials => ({
		heat: $form.dials.heat ?? suggested.heat,
		kink: $form.dials.kink ?? suggested.kink
	});

	function setDial(key: keyof SceneDials, level: DialValue | null) {
		$form.dials = { ...$form.dials, [key]: level };
	}

	/** Parts from a template or the model, with ids of their own. */
	const withIds = (parts: readonly SuggestedPart[]): ScenePart[] =>
		parts.map((part) => ({ ...part, id: crypto.randomUUID() }));

	const superform = superForm(defaults(start, zod4Client(daydreamSceneFormSchema)), {
		SPA: true,
		// Nothing for the page to apply or reload: the dialog saves through the
		// API and hands the result back. Left on, superforms re-runs the page's
		// loads, and the setup form underneath — whose empty initial form is
		// still in `page.data` under the same id — was reset to it, losing the
		// character that had just been added.
		applyAction: false,
		invalidateAll: false,
		// The heat and kink dials are a nested object, which superforms only allows as JSON.
		dataType: 'json',
		resetForm: false,
		validators: zod4Client(daydreamSceneFormSchema),
		async onUpdate({ form: submitted }) {
			problem = null;
			if (!submitted.valid) {
				return;
			}
			const { saveToLibrary, ...fields } = submitted.data;
			const content = {
				...fields,
				title: fields.title.trim(),
				premise: fields.premise.trim(),
				parts: fields.parts.map((part) => ({
					...part,
					name: part.name.trim(),
					description: part.description.trim()
				}))
			};
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
		$form.title.trim() === '' &&
			SCENE_TEXT_FIELDS.every((field) => $form[field].trim() === '') &&
			$form.parts.length === 0
	);

	function useTemplate(id: string) {
		const template = SCENE_TEMPLATES.find((entry) => entry.id === id);
		if (template) {
			$form = { ...$form, ...template.scene, parts: withIds(template.scene.parts) };
			revealDetail();
		}
	}

	// ── parts ────────────────────────────────────────────────────────────────

	function addPart() {
		$form.parts = [...$form.parts, { id: crypto.randomUUID(), name: '', description: '' }];
	}

	function setPart(index: number, patch: Partial<ScenePart>) {
		$form.parts = $form.parts.map((part, at) => (at === index ? { ...part, ...patch } : part));
	}

	function removePart(index: number) {
		$form.parts = $form.parts.filter((_, at) => at !== index);
	}

	/**
	 * A part's text box, wired by hand: `wa-input`'s own input event comes
	 * from inside its shadow root, which Svelte's delegated `oninput` does not
	 * reliably see (AGENTS.md).
	 */
	function partField(index: number, key: 'name' | 'description') {
		return (node: HTMLElement & { value: string }) => {
			const update = () => setPart(index, { [key]: node.value });
			node.addEventListener('input', update);
			return () => node.removeEventListener('input', update);
		};
	}

	let thinking = $state(false);

	/** A whole scene from the model, in place of what is in the form. */
	async function makeOneUp() {
		thinking = true;
		problem = null;
		const answer = await surpriseScene(context, $form.dials);
		thinking = false;
		if (answer.ok) {
			$form = {
				...$form,
				...answer.value,
				parts: withIds(answer.value.parts),
				dials: keepSetDials(answer.value.dials)
			};
			revealDetail();
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
		const answer = await suggestFill({
			target: 'scene',
			draft,
			parts: namedParts(),
			sceneDials: $form.dials,
			context
		});
		thinking = false;
		if (!answer.ok) {
			problem = answer.error;
			return;
		}
		const next = { ...$form };
		for (const field of ['title', ...SCENE_TEXT_FIELDS] as const) {
			const text = answer.value.fields[field];
			if (text && next[field].trim() === '') {
				next[field] = text;
			}
		}
		// Parts only for a scene that had none: never over the ones written.
		if (next.parts.length === 0) {
			next.parts = withIds(answer.value.parts);
		}
		next.dials = keepSetDials(answer.value.sceneDials);
		$form = next;
		revealDetail();
	}

	/** The parts with a name so far, for the model to fit its ideas to. */
	const namedParts = () =>
		$form.parts
			.filter((part) => part.name.trim() !== '')
			.map(({ name, description }) => ({ name, description }));

	function moreIdeas(field: SceneTextField) {
		return () =>
			suggestChips({
				target: 'scene',
				field,
				draft,
				parts: namedParts(),
				sceneDials: $form.dials,
				context
			});
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

{#snippet textField(field: SceneTextField)}
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
{/snippet}

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
						{const level = $derived(sceneLevel(template.scene.dials))}
						<wa-button size="s" appearance="outlined" onclick={() => useTemplate(template.id)}>
							{template.label}
							{#if level}<span class="level">{level}</span>{/if}
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

		{#each SCENE_PRIMARY_FIELDS as field (field)}
			{@render textField(field)}
		{/each}

		<fieldset class="heat">
			<legend>Heat and kink</legend>
			<p class="hint">How sexual and how kinky it is, from SFW to filthy. Optional: left unset, the story follows what you wrote.</p>
			{#each SCENE_SLIDERS as entry (entry.key)}
				<DaydreamOptionalSlider
					label={entry.label}
					low={entry.low}
					high={entry.high}
					scale={entry.scale}
					value={$form.dials[entry.key]}
					onchange={(level) => setDial(entry.key, level)}
				/>
			{/each}
		</fieldset>

		<fieldset class="parts">
			<legend>Parts for characters</legend>
			<p class="hint">
				Who else the scene needs, like “the interviewer”. Characters are cast into these when you
				set up a daydream. Optional.
			</p>
			{#each $form.parts as part, index (part.id)}
				<div class="part">
					<wa-input
						{@attach partField(index, 'name')}
						class="part-name"
						label={`Part ${index + 1}`}
						placeholder="the interviewer"
						value={part.name}
						maxlength={DAYDREAM_LIMITS.partName}
					></wa-input>
					<wa-input
						{@attach partField(index, 'description')}
						class="part-description"
						label="What they do in it"
						value={part.description}
						maxlength={DAYDREAM_LIMITS.partDescription}
					></wa-input>
					<wa-button size="s" appearance="plain" onclick={() => removePart(index)}>
						<wa-icon name="xmark" variant="solid" label={`Remove ${part.name || `part ${index + 1}`}`}></wa-icon>
					</wa-button>
				</div>
				{#if $errors.parts?.[index]?.name}<span class="invalid">{$errors.parts[index].name}</span>{/if}
			{/each}
			{#if $form.parts.length < MAX_DAYDREAM_CHARACTERS}
				<wa-button class="add-part" size="s" appearance="outlined" onclick={addPart}>
					<wa-icon slot="start" name="plus" variant="solid"></wa-icon>
					Add a part
				</wa-button>
			{/if}
		</fieldset>

		<wa-details bind:this={detail} summary="More detail" class="detail" {@attach startOpen(startsDetailed)}>
			{#each DETAIL_FIELDS as field (field)}
				{@render textField(field)}
			{/each}
		</wa-details>

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

	/* How sexual and how kinky a starting point is, said on it, so nobody
	   picks one blind. */
	.level {
		margin-inline-start: 0.4em;
		font-size: 0.75rem;
		color: var(--wa-color-text-quiet);
	}

	.heat {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		border: 0;
		padding: 0;

		legend {
			padding: 0;
			margin-block-end: 0.25rem;
			font-weight: 600;
		}

		.hint {
			margin: 0;
		}
	}

	.parts {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		border: 0;
		padding: 0;

		legend {
			padding: 0;
			margin-block-end: 0.25rem;
			font-weight: 600;
		}
	}

	/* Wraps rather than squeezing: on a phone the description drops under the name. */
	.part {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem;

		.part-name {
			flex: 1 1 8rem;
		}

		.part-description {
			flex: 2 1 12rem;
		}
	}

	.add-part {
		align-self: flex-start;
	}

	.detail::part(content) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
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
