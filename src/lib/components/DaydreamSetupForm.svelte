<script lang="ts">
	import type { WaSelectEvent } from '@awesome.me/webawesome/dist/events/select.js';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import {
		DAYDREAM_LEADS,
		DAYDREAM_LIMITS,
		type DaydreamCharacterCopy,
		type DaydreamSceneCopy,
		leadApplies,
		MAX_DAYDREAM_CHARACTERS
	} from '$lib/daydream';
	import { type CopyState, copyState } from '$lib/daydream/chips';
	import { saveLibraryItem } from '$lib/daydream/client';
	import type { SuggestContext } from '$lib/daydream/suggest';
	import { type DaydreamSetupFormValues, daydreamSetupFormSchema } from '$lib/schemas/daydreamForm';
	import { sealForSubmit } from '$lib/sealed-forms';
	import { type DaydreamSetupContent, daydreamSetupKind } from '$lib/sealed-kinds/daydreams';
	import { openedDaydreamCharacter, openedDaydreamScene } from '$lib/sealed-views.svelte';
	import { superForm } from '$lib/superform';
	import type { DaydreamLibraryItemView, DaydreamLibraryView, SealedRefView } from '$lib/types';
	import DaydreamCharacterDialog from './DaydreamCharacterDialog.svelte';
	import DaydreamCopyCard from './DaydreamCopyCard.svelte';
	import DaydreamDials from './DaydreamDials.svelte';
	import DaydreamSceneDialog from './DaydreamSceneDialog.svelte';
	import DaydreamVoicePicker from './DaydreamVoicePicker.svelte';

	/**
	 * A daydream's setup: how it is told, who is in it, the scene, and what
	 * must not happen. Characters and scenes come from the user's library, or
	 * are made new in a dialog; the daydream keeps a copy of each, and offers
	 * the newer version when the library's has changed.
	 *
	 * Sealed in the user's own vault before it is posted, like a self task
	 * (`SealedTaskEditor.svelte`); the action only ever sees the sealed record.
	 * The form's data is nested, so it posts as JSON (`dataType: 'json'`), and
	 * `onSubmit` replaces the whole post with the sealed record.
	 */
	let {
		setupForm,
		daydream = null,
		library,
		suggestionsOn,
		submitLabel
	}: {
		/** The empty form, as the load prepared it. */
		setupForm: SuperValidated<DaydreamSetupFormValues>;
		/** The daydream being edited, opened; null to create one. */
		daydream?: { id: string; revision: number; setup: DaydreamSetupContent } | null;
		library: DaydreamLibraryView;
		/** Whether the model may be asked for ideas (the disclosure has been accepted). */
		suggestionsOn: boolean;
		submitLabel: string;
	} = $props();

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
		? { ...setupForm, id: `${setupForm.id}:opened`, data: structuredClone(daydream.setup) }
		: setupForm;

	const superform = superForm(initial, {
		dataType: 'json',
		resetForm: false,
		validators: zod4Client(daydreamSetupFormSchema),
		async onSubmit({ formData, cancel, jsonData }) {
			problem = null;
			// superforms validates after `onSubmit`, and this has to seal what it
			// validated, so it validates first itself.
			const checked = await superform.validateForm({ update: true });
			if (!checked.valid) {
				cancel();
				problem = checked.errors.voice?._errors?.[0] ?? null;
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
			// Nothing of the setup goes in the post but the sealed record: the
			// inputs' own fields are taken out, and the JSON is replaced.
			for (const key of [...formData.keys()]) {
				formData.delete(key);
			}
			jsonData({
				...outcome.fields,
				...(daydream ? { expectedRevision: daydream.revision } : {})
			} as never);
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

	/** Solid only when there is something valid to save (AGENTS.md, "Save buttons"). */
	const canSave = $derived(
		(daydream === null || isTainted($tainted)) && daydreamSetupFormSchema.safeParse($form).success
	);

	// ── the library ──────────────────────────────────────────────────────────

	// svelte-ignore state_referenced_locally
	// The library as loaded, kept here so a character saved from a dialog is
	// offered at once rather than after a reload.
	let characters = $state([...library.characters]);
	// svelte-ignore state_referenced_locally
	let scenes = $state([...library.scenes]);
	const characterRevisions = $derived(new Map(characters.map((item) => [item.id, item])));
	const sceneRevisions = $derived(new Map(scenes.map((item) => [item.id, item])));

	/** Library characters not already in this daydream, opened. */
	const pickable = $derived(
		characters.flatMap((item) => {
			if ($form.characters.some((character) => character.sourceId === item.id)) {
				return [];
			}
			const opened = openedDaydreamCharacter(item.sealed);
			return [{ item, opened }];
		})
	);

	const context: SuggestContext = $derived({
		characters: $form.characters.map((character) => ({
			name: character.name,
			archetype: character.archetype
		})),
		limits: $form.limits,
		story: $form.dials
	});

	function characterSummary(character: DaydreamCharacterCopy): string {
		return [character.archetype, character.personality].filter(Boolean).join(' · ').slice(0, 140);
	}

	// ── dialogs ──────────────────────────────────────────────────────────────

	/** The character dialog: which one it edits (an index into the form's list), or a new one. */
	let characterDialog: { index: number | null } | null = $state(null);
	let sceneDialog: { surprise: boolean; edit: boolean } | null = $state(null);

	function putCharacter(
		index: number | null,
		character: DaydreamCharacterCopy,
		sealed?: SealedRefView
	) {
		const list = [...$form.characters];
		if (index === null) {
			list.push(character);
		} else {
			list[index] = character;
		}
		$form.characters = list;
		rememberLibrary('characters', character, sealed);
	}

	function putScene(scene: DaydreamSceneCopy, sealed?: SealedRefView) {
		$form.scene = scene;
		rememberLibrary('scenes', scene, sealed);
	}

	/**
	 * After a save to the library, so the item and its new revision are known
	 * here without a reload: offered in the pickers, and compared against.
	 */
	function rememberLibrary(
		kind: 'characters' | 'scenes',
		copy: DaydreamCharacterCopy | DaydreamSceneCopy,
		sealed: SealedRefView | undefined
	) {
		if (!sealed || copy.sourceId === null || copy.sourceRevision === null) {
			return;
		}
		const row: DaydreamLibraryItemView = {
			id: copy.sourceId,
			revision: copy.sourceRevision,
			updatedAt: new Date(),
			sealed
		};
		const list = kind === 'characters' ? characters : scenes;
		const next = [row, ...list.filter((item) => item.id !== row.id)];
		if (kind === 'characters') {
			characters = next;
		} else {
			scenes = next;
		}
	}

	/** A dropdown item's value: the property, which is what Svelte set on the upgraded element. */
	const selectedValue = (event: WaSelectEvent) =>
		(event.detail.item as HTMLElement & { value?: string }).value;

	function addFromLibrary(event: WaSelectEvent) {
		const id = selectedValue(event);
		if (id === 'new') {
			characterDialog = { index: null };
			return;
		}
		const entry = pickable.find((candidate) => candidate.item.id === id);
		if (entry?.opened) {
			putCharacter(null, {
				...entry.opened,
				sourceId: entry.item.id,
				sourceRevision: entry.item.revision
			});
		}
	}

	function pickScene(event: WaSelectEvent) {
		const id = selectedValue(event);
		const item = scenes.find((candidate) => candidate.id === id);
		const opened = item ? openedDaydreamScene(item.sealed) : null;
		if (item && opened) {
			$form.scene = { ...opened, sourceId: item.id, sourceRevision: item.revision };
		}
	}

	function useLatestCharacter(index: number) {
		const copy = $form.characters[index];
		const item = copy?.sourceId ? characterRevisions.get(copy.sourceId) : undefined;
		const opened = item ? openedDaydreamCharacter(item.sealed) : null;
		if (item && opened) {
			putCharacter(index, { ...opened, sourceId: item.id, sourceRevision: item.revision });
		}
	}

	function keepCharacter(index: number) {
		const copy = $form.characters[index];
		const item = copy?.sourceId ? characterRevisions.get(copy.sourceId) : undefined;
		if (copy && item) {
			putCharacter(index, { ...copy, sourceRevision: item.revision });
		}
	}

	async function saveCopy(
		kind: 'characters' | 'scenes',
		copy: DaydreamCharacterCopy | DaydreamSceneCopy
	) {
		const { sourceId: _id, sourceRevision: _revision, ...content } = copy;
		const id = crypto.randomUUID();
		const saved = await saveLibraryItem(kind, { id, content, expectedRevision: null });
		if (!saved.ok) {
			problem = saved.error;
			return null;
		}
		return { copy: { ...copy, sourceId: id, sourceRevision: saved.revision }, sealed: saved.sealed };
	}

	/** Whether the library's current version of `sourceId` has opened here, to be taken. */
	function latestOpened(
		items: ReadonlyMap<string, DaydreamLibraryItemView>,
		sourceId: string | null,
		open: (ref: SealedRefView) => unknown
	): boolean {
		const item = sourceId ? items.get(sourceId) : undefined;
		return Boolean(item && open(item.sealed));
	}

	function sceneState(): CopyState {
		return copyState($form.scene, sceneRevisions);
	}

	const sceneChosen = $derived($form.scene.title.trim() !== '' && $form.scene.premise.trim() !== '');
	const showLead = $derived(leadApplies($form.voice, $form.characters.length));
	const charactersNote = $derived.by(() => {
		if ($form.voice.narrator === 'none') {
			return 'Who you are talking with. At least one.';
		}
		return $form.voice.stance === 'absent'
			? 'Who you are watching. At least one.'
			: 'Optional: people the narrator brings in. Without any, the narrator alone tells it.';
	});

	/** What a library item shows in a picker before, or instead of, its name. */
	const notShown = (opened: unknown) => (opened === undefined ? 'Opening…' : 'Cannot be shown');

	function setLimits(event: Event) {
		$form.limits = (event.currentTarget as HTMLTextAreaElement).value;
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
		<legend>How it's told</legend>
		<DaydreamVoicePicker
			value={$form.voice}
			characterCount={$form.characters.length}
			onchange={(voice) => {
				$form.voice = voice;
			}}
		/>
	</fieldset>

	<fieldset>
		<legend>Characters</legend>
		<p class="hint">{charactersNote}</p>
		{#each $form.characters as character, index (character.sourceId ?? `copy-${index}`)}
			<DaydreamCopyCard
				title={character.name}
				summary={characterSummary(character)}
				state={copyState(character, characterRevisions)}
				kindName="characters"
				onedit={() => {
			characterDialog = { index };
		}}
				onremove={() => {
					$form.characters = $form.characters.filter((_, at) => at !== index);
				}}
				onuselatest={() => useLatestCharacter(index)}
				latestReady={latestOpened(characterRevisions, character.sourceId, openedDaydreamCharacter)}
				onkeep={() => keepCharacter(index)}
				onsave={async () => {
					const saved = await saveCopy('characters', character);
					if (saved) {
						putCharacter(index, saved.copy as DaydreamCharacterCopy, saved.sealed);
					}
				}}
			/>
		{/each}
		{#if $form.characters.length < MAX_DAYDREAM_CHARACTERS}
			<wa-dropdown onwa-select={addFromLibrary}>
				<wa-button slot="trigger" size="s" appearance="outlined" with-caret>
					<wa-icon slot="start" name="user-plus" variant="solid"></wa-icon>
					Add a character
				</wa-button>
				<wa-dropdown-item value="new">
					<wa-icon slot="icon" name="plus" variant="solid"></wa-icon>
					New character
				</wa-dropdown-item>
				{#each pickable as { item, opened } (item.id)}
					<wa-dropdown-item value={item.id} disabled={!opened}>
						{opened?.name ?? notShown(opened)}
					</wa-dropdown-item>
				{/each}
			</wa-dropdown>
		{/if}
	</fieldset>

	<fieldset>
		<legend>The scene</legend>
		{#if sceneChosen}
			<DaydreamCopyCard
				title={$form.scene.title}
				summary={$form.scene.premise.slice(0, 160)}
				state={sceneState()}
				kindName="scenes"
				onedit={() => {
			sceneDialog = { surprise: false, edit: true };
		}}
				latestReady={latestOpened(sceneRevisions, $form.scene.sourceId, openedDaydreamScene)}
				onuselatest={() => {
					const item = $form.scene.sourceId ? sceneRevisions.get($form.scene.sourceId) : undefined;
					const opened = item ? openedDaydreamScene(item.sealed) : null;
					if (item && opened) {
						putScene({ ...opened, sourceId: item.id, sourceRevision: item.revision });
					}
				}}
				onkeep={() => {
					const item = $form.scene.sourceId ? sceneRevisions.get($form.scene.sourceId) : undefined;
					if (item) {
						putScene({ ...$form.scene, sourceRevision: item.revision });
					}
				}}
				onsave={async () => {
					const saved = await saveCopy('scenes', $form.scene);
					if (saved) {
						putScene(saved.copy as DaydreamSceneCopy, saved.sealed);
					}
				}}
			/>
		{:else}
			<p class="hint">Where it happens and what is going on.</p>
		{/if}
		<div class="scene-choices">
			{#if scenes.length > 0}
				<wa-dropdown onwa-select={pickScene}>
					<wa-button slot="trigger" size="s" appearance="outlined" with-caret>Choose a saved scene</wa-button>
					{#each scenes as item (item.id)}
						{const opened = $derived(openedDaydreamScene(item.sealed))}
						<wa-dropdown-item value={item.id} disabled={!opened}>
							{opened?.title ?? notShown(opened)}
						</wa-dropdown-item>
					{/each}
				</wa-dropdown>
			{/if}
			<wa-button size="s" appearance="outlined" onclick={() => {
			sceneDialog = { surprise: false, edit: false };
		}}>
				<wa-icon slot="start" name="plus" variant="solid"></wa-icon>
				New scene
			</wa-button>
			{#if suggestionsOn}
				<wa-button size="s" appearance="outlined" onclick={() => {
			sceneDialog = { surprise: true, edit: false };
		}}>
					<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>
					Surprise me
				</wa-button>
			{/if}
		</div>
		{#if $errors.scene?.premise || $errors.scene?.title}
			<span class="invalid">Choose a scene, or make one.</span>
		{/if}
	</fieldset>

	{#if showLead}
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
	{/if}

	<fieldset>
		<legend>Your limits</legend>
		<label>
			<span>What must not happen</span>
			<textarea
				rows="3"
				maxlength={DAYDREAM_LIMITS.limits}
				placeholder="Anything that is off the table."
				value={$form.limits}
				oninput={setLimits}></textarea>
			{#if $errors.limits}<span class="invalid">{$errors.limits}</span>{/if}
		</label>
		<p class="hint">
			While it plays, “Stop the scene” and “Ease off” are always there, and selecting words and
			choosing “Not this” adds them here.
		</p>
	</fieldset>

	<fieldset>
		<legend>Dials</legend>
		<DaydreamDials
			value={$form.dials}
			onchange={(dials) => {
				$form.dials = dials;
			}}
		/>
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

<!-- Outside the form: each dialog is a form of its own, and forms do not nest. -->
{#if characterDialog}
	{const index = $derived(characterDialog.index)}
	{const editing = $derived(index === null ? null : ($form.characters[index] ?? null))}
	<DaydreamCharacterDialog
		character={editing}
		libraryRevision={editing?.sourceId ? (characterRevisions.get(editing.sourceId)?.revision ?? null) : null}
		{context}
		{suggestionsOn}
		onsaved={(character, sealed) => putCharacter(index, character, sealed)}
		onclose={() => {
			characterDialog = null;
		}}
	/>
{/if}
{#if sceneDialog}
	{const editing = $derived(sceneDialog.edit ? $form.scene : null)}
	<DaydreamSceneDialog
		scene={editing}
		libraryRevision={editing?.sourceId ? (sceneRevisions.get(editing.sourceId)?.revision ?? null) : null}
		surprise={sceneDialog.surprise}
		{context}
		{suggestionsOn}
		onsaved={putScene}
		onclose={() => {
			sceneDialog = null;
		}}
	/>
{/if}

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

	.scene-choices {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	/* A group of radios is a fieldset, but this one reads as a field rather
	   than as another box inside the box. */
	.lead {
		gap: 0.35rem;

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
