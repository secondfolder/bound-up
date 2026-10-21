<script lang="ts">
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import {
		CHARACTER_PRIMARY_FIELDS,
		CHARACTER_TEXT_FIELDS,
		type CharacterDials,
		type CharacterTextField,
		type CharacterTone,
		DAYDREAM_LIMITS,
		type DaydreamCasting,
		type DaydreamCharacter,
		type DaydreamCharacterCopy,
		type DialValue,
		EMPTY_CASTING,
		EMPTY_CHARACTER,
		type IdeaPart
	} from '$lib/daydream';
	import {
		CASTING_CHIPS,
		CASTING_FIELD_LABELS,
		CHARACTER_CHIPS,
		CHARACTER_FIELD_LABELS,
		CHARACTER_TEMPLATES
	} from '$lib/daydream/catalog';
	import { saveLibraryItem } from '$lib/daydream/client';
	import { CHARACTER_SLIDERS, CHARACTER_TONES, characterLevel } from '$lib/daydream/dial-words';
	import {
		type SuggestContext,
		type SuggestFailure,
		suggestChips,
		suggestFill
	} from '$lib/daydream/suggest';
	import {
		type DaydreamCharacterFormValues,
		daydreamCharacterFormSchema
	} from '$lib/schemas/daydreamForm';
	import { superForm } from '$lib/superform';
	import type { SealedRefView } from '$lib/types';
	import DaydreamChipField from './DaydreamChipField.svelte';
	import { startOpen } from './details';
	import OptionalSlider from './OptionalSlider.svelte';
	import SuggestionProblem from './SuggestionProblem.svelte';
	import './choice-controls.css';

	/** What the dialog needs to edit a character's casting: given only when opened from a daydream. */
	export type CastingEdit = {
		value: DaydreamCasting;
		/** The idea's parts, with who else plays each, so a part cannot be given twice. */
		parts: (IdeaPart & { takenBy: string | null })[];
		/** Asks the model who this character is in the story; absent when suggestions are off. */
		write?:
			| ((
					character: Omit<DaydreamCharacter, 'dials'>,
					partId: string | null
			  ) => Promise<
					{ ok: true; value: { relationship: string; part: string } } | { ok: false; error: string }
			  >)
			| undefined;
	};

	/**
	 * Making or changing a character, in a dialog over whatever page wanted
	 * one: the setup form, or the character library.
	 *
	 * In two halves when opened from a daydream. "In this story" is the
	 * casting — the part they play, who they are to the user, what they are
	 * doing — which belongs to this daydream alone and is never saved to the
	 * library. Below it is who they are in any story, which is what "Save to
	 * my characters" saves. From the library there is only the second half.
	 * Of that, the name, type and personality are up front; the rest is under
	 * "More detail", which starts open when any of it is filled.
	 *
	 * Guided rather than a blank form: starting points to begin from, dials
	 * for the broad strokes (a tone, and how much they take charge, how
	 * strict, how cruel, how much they talk, how much they want sex and how
	 * kinky they are), and chips under every field. The
	 * free text is the truth, and the model is told so where the dials and the
	 * description disagree.
	 *
	 * An SPA superform that saves through `api/daydreams/characters` rather
	 * than a form action: it opens over another form (the setup's) whose state
	 * must survive it, and from three different pages, so it has no action of
	 * its own to post to.
	 */
	let {
		character = null,
		libraryRevision = null,
		casting = null,
		context,
		suggestionsOn,
		debug = false,
		onsaved,
		onclose
	}: {
		/** The character being changed; null for a new one. */
		character?: DaydreamCharacterCopy | null;
		/** The library's revision of `character.sourceId`, when it is in the library. */
		libraryRevision?: number | null;
		/** Their casting in the daydream, to edit beside them; null from the library. */
		casting?: CastingEdit | null;
		/** The daydream around it, for suggestions. */
		context: SuggestContext;
		/** Whether the model may be asked for ideas (the disclosure has been accepted). */
		suggestionsOn: boolean;
		/** Debug mode: a failed suggestion shows what came back. */
		debug?: boolean;
		/**
		 * The character as saved: a copy for a daydream, with where it came
		 * from and their casting (empty from the library), and the sealed
		 * library record too, when it was saved there.
		 */
		onsaved: (character: DaydreamCharacterCopy, sealed?: SealedRefView) => void;
		onclose: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captured once, as every superform is: the dialog is opened afresh for each character.
	const existing = character;
	// svelte-ignore state_referenced_locally
	const knownRevision = libraryRevision;
	// svelte-ignore state_referenced_locally
	const castingEdit = casting;
	const inLibrary = existing?.sourceId !== null && knownRevision !== null;

	const start: DaydreamCharacterFormValues = existing
		? {
				name: existing.name,
				archetype: existing.archetype,
				personality: existing.personality,
				speech: existing.speech,
				appearance: existing.appearance,
				likes: existing.likes,
				notes: existing.notes,
				dials: existing.dials,
				casting: castingEdit?.value ?? EMPTY_CASTING,
				// Ticked for one already in the library; a copy kept only in a
				// daydream stays that way unless asked.
				saveToLibrary: inLibrary
			}
		: { ...EMPTY_CHARACTER, casting: castingEdit?.value ?? EMPTY_CASTING, saveToLibrary: true };

	let problem: SuggestFailure | null = $state(null);
	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();
	let detail: (HTMLElement & { open: boolean }) | undefined = $state();

	const DETAIL_FIELDS = CHARACTER_TEXT_FIELDS.filter(
		(field) => !(CHARACTER_PRIMARY_FIELDS as readonly CharacterTextField[]).includes(field)
	);
	const detailFilled = (values: Pick<DaydreamCharacterFormValues, CharacterTextField | 'dials'>) =>
		DETAIL_FIELDS.some((field) => values[field].trim() !== '') ||
		Object.values(values.dials).some((dial) => dial !== null);
	const startsDetailed = detailFilled(start);

	/** Opens "More detail" when something just wrote into it, so what changed is in view. */
	function revealDetail() {
		if (detail && detailFilled($form)) {
			detail.open = true;
		}
	}

	const superform = superForm(defaults(start, zod4Client(daydreamCharacterFormSchema)), {
		SPA: true,
		// Nothing for the page to apply or reload: the dialog saves through the
		// API and hands the result back. Left on, superforms re-runs the page's
		// loads, and the setup form underneath — whose empty initial form is
		// still in `page.data` under the same id — was reset to it, losing the
		// character that had just been added.
		applyAction: false,
		invalidateAll: false,
		// The dials are a nested object, which superforms only allows as JSON.
		dataType: 'json',
		resetForm: false,
		validators: zod4Client(daydreamCharacterFormSchema),
		async onUpdate({ form: submitted }) {
			problem = null;
			if (!submitted.valid) {
				return;
			}
			// The casting is the daydream's alone: never part of what the library keeps.
			const { saveToLibrary, casting: cast, ...fields } = submitted.data;
			const content = { ...fields, name: fields.name.trim() };
			const castingOut = castingEdit
				? {
						partId: cast.partId,
						relationship: cast.relationship.trim(),
						part: cast.part.trim()
					}
				: EMPTY_CASTING;
			if (!saveToLibrary) {
				// Kept only in the daydream: a copy with no library record, so it
				// never claims to match one it no longer does.
				onsaved({ ...content, sourceId: null, sourceRevision: null, casting: castingOut });
				close();
				return;
			}
			const id = inLibrary && existing?.sourceId ? existing.sourceId : crypto.randomUUID();
			const saved = await saveLibraryItem('characters', {
				id,
				content,
				expectedRevision: inLibrary ? knownRevision : null
			});
			if (!saved.ok) {
				problem = { error: saved.error };
				return;
			}
			onsaved(
				{ ...content, sourceId: id, sourceRevision: saved.revision, casting: castingOut },
				saved.sealed
			);
			close();
		}
	});

	const { form, errors, submitting, tainted, isTainted } = superform;

	function close() {
		if (dialog) {
			dialog.open = false;
		}
	}

	/** Solid only when there is something valid to save (AGENTS.md, "Save buttons"). */
	const canSave = $derived(
		(existing === null || isTainted($tainted)) && daydreamCharacterFormSchema.safeParse($form).success
	);

	const draft = $derived(
		Object.fromEntries(
			(['name', ...CHARACTER_TEXT_FIELDS] as const).map((field) => [field, $form[field]])
		) as Record<string, string>
	);

	const empty = $derived(
		$form.name.trim() === '' && CHARACTER_TEXT_FIELDS.every((field) => $form[field].trim() === '')
	);

	function useTemplate(id: string) {
		const template = CHARACTER_TEMPLATES.find((entry) => entry.id === id);
		if (template) {
			$form = { ...$form, ...template.character };
			revealDetail();
		}
	}

	function setTone(tone: CharacterTone | null) {
		$form.dials = { ...$form.dials, tone: $form.dials.tone === tone ? null : tone };
	}

	function setDial(key: Exclude<keyof CharacterDials, 'tone'>, level: DialValue | null) {
		$form.dials = { ...$form.dials, [key]: level };
	}

	let filling = $state(false);
	async function fillTheRest() {
		filling = true;
		problem = null;
		const answer = await suggestFill({ target: 'character', draft, dials: $form.dials, context });
		filling = false;
		if (!answer.ok) {
			problem = answer;
			return;
		}
		// Only the empty fields: never over what was written.
		const next = { ...$form };
		for (const field of ['name', ...CHARACTER_TEXT_FIELDS] as const) {
			const text = answer.value.fields[field];
			if (text && next[field].trim() === '') {
				next[field] = text;
			}
		}
		$form = next;
		revealDetail();
	}

	// ── in this story ────────────────────────────────────────────────────────

	let writing = $state(false);
	const castingFull = $derived(
		$form.casting.relationship.trim() !== '' && $form.casting.part.trim() !== ''
	);

	/** Who they are in this story, from the model: into the empty fields only. */
	async function writeCasting() {
		if (!castingEdit?.write) {
			return;
		}
		writing = true;
		problem = null;
		const { dials: _dials, casting: _casting, saveToLibrary: _save, ...actor } = $form;
		const answer = await castingEdit.write(actor, $form.casting.partId);
		writing = false;
		if (!answer.ok) {
			problem = answer;
			return;
		}
		$form.casting = {
			...$form.casting,
			relationship: $form.casting.relationship.trim() || answer.value.relationship,
			part: $form.casting.part.trim() || answer.value.part
		};
	}

	const NO_PART = 'none';

	/** The part select, wired by hand: its change event comes from inside a shadow root (AGENTS.md). */
	function partSelect(node: HTMLElement & { value: string }) {
		const update = () => {
			$form.casting = { ...$form.casting, partId: node.value === NO_PART ? null : node.value };
		};
		node.addEventListener('change', update);
		return () => node.removeEventListener('change', update);
	}

	function moreIdeas(field: CharacterTextField) {
		return () => suggestChips({ target: 'character', field, draft, dials: $form.dials, context });
	}

	const LIMIT_OF: Record<CharacterTextField, number> = {
		archetype: DAYDREAM_LIMITS.archetype,
		personality: DAYDREAM_LIMITS.personality,
		speech: DAYDREAM_LIMITS.speech,
		appearance: DAYDREAM_LIMITS.appearance,
		likes: DAYDREAM_LIMITS.likes,
		notes: DAYDREAM_LIMITS.characterNotes
	};
</script>

{#snippet textField(field: CharacterTextField)}
	<DaydreamChipField
		{debug}
		label={CHARACTER_FIELD_LABELS[field].label}
		hint={CHARACTER_FIELD_LABELS[field].hint}
		value={$form[field]}
		limit={LIMIT_OF[field]}
		chips={CHARACTER_CHIPS[field]}
		rows={field === 'personality' || field === 'notes' ? 3 : 2}
		onchange={(text) => {
			$form[field] = text;
		}}
		onMoreIdeas={suggestionsOn ? moreIdeas(field) : undefined}
	/>
	{#if $errors[field]}<span class="invalid">{$errors[field]}</span>{/if}
{/snippet}

<!-- No light-dismiss: a stray tap outside would throw away a half-made character. -->
<wa-dialog
	bind:this={dialog}
	class="character-dialog"
	label={existing ? `Change ${existing.name}` : 'A new character'}
	open
	onwa-after-hide={(event: Event) => event.target === dialog && onclose()}
>
	<form method="POST" use:superform.enhance class="fields">
		{#if !existing && empty}
			<section class="templates" aria-label="Start from">
				<p class="hint">Start from one of these, or from nothing.</p>
				<div class="template-list">
					{#each CHARACTER_TEMPLATES as template (template.id)}
						{const level = $derived(characterLevel(template.character.dials))}
						<wa-button size="s" appearance="outlined" onclick={() => useTemplate(template.id)}>
							{template.label}
							{#if level}<span class="level">{level}</span>{/if}
						</wa-button>
					{/each}
				</div>
			</section>
		{/if}

		{#if castingEdit}
			<fieldset class="section">
				<legend>In this daydream</legend>
				<p class="hint">Only for this daydream: the same character can be someone else in the next.</p>
				{#if castingEdit.parts.length > 0}
					<wa-select
						{@attach partSelect}
						label="Their part"
						value={$form.casting.partId ?? NO_PART}
					>
						<wa-option value={NO_PART}>No particular part</wa-option>
						{#each castingEdit.parts as part (part.id)}
							<wa-option value={part.id} disabled={part.takenBy !== null}>
								{part.takenBy ? `${part.name} (${part.takenBy})` : part.name}
							</wa-option>
						{/each}
					</wa-select>
				{/if}
				{#each ['relationship', 'part'] as const as field (field)}
					<DaydreamChipField
		{debug}
						label={CASTING_FIELD_LABELS[field].label}
						hint={CASTING_FIELD_LABELS[field].hint}
						value={$form.casting[field]}
						limit={field === 'relationship' ? DAYDREAM_LIMITS.relationship : DAYDREAM_LIMITS.castPart}
						chips={CASTING_CHIPS[field]}
						onchange={(text) => {
							$form.casting = { ...$form.casting, [field]: text };
						}}
					/>
				{/each}
				{#if castingEdit.write}
					<wa-button
						class="fill"
						size="s"
						appearance="outlined"
						disabled={writing || castingFull || $form.name.trim() === ''}
						onclick={writeCasting}
					>
						<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>
						{writing ? 'Writing…' : 'Write their part'}
					</wa-button>
				{/if}
			</fieldset>
		{/if}

		<fieldset class="section" class:bare={!castingEdit}>
			<legend class:wa-visually-hidden={!castingEdit}>
				{$form.name.trim() ? `About ${$form.name.trim()}` : 'About them'}
			</legend>

			<InputField
				{superform}
				field="name"
				type="text"
				title="Their name"
				maxlength={DAYDREAM_LIMITS.characterName}
				required
			/>

			{#each CHARACTER_PRIMARY_FIELDS as field (field)}
				{@render textField(field)}
			{/each}

			<wa-details bind:this={detail} summary="More detail" class="detail" {@attach startOpen(startsDetailed)}>
				<fieldset class="dials">
					<legend>In broad strokes</legend>
					<fieldset class="tones">
						<legend class="wa-visually-hidden">Tone</legend>
						{#each CHARACTER_TONES as tone (tone.value)}
							<!-- A toggle: a native button, because wa-button forwards no aria-pressed. -->
							<button
								type="button"
								class="tone choice-chip"
								aria-pressed={$form.dials.tone === tone.value}
								onclick={() => setTone(tone.value)}
							>
								{tone.label}
							</button>
						{/each}
					</fieldset>
					{#each CHARACTER_SLIDERS as entry (entry.key)}
						<OptionalSlider
							label={entry.label}
							low={entry.low}
							high={entry.high}
							scale={entry.scale}
							value={$form.dials[entry.key]}
							onchange={(level) => setDial(entry.key, level)}
						/>
					{/each}
				</fieldset>

				{#each DETAIL_FIELDS as field (field)}
					{@render textField(field)}
				{/each}
			</wa-details>

			{#if suggestionsOn}
				<wa-button class="fill" size="s" appearance="outlined" disabled={filling} onclick={fillTheRest}>
					<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>
					{filling ? 'Filling in…' : 'Fill in the rest'}
				</wa-button>
			{/if}
		</fieldset>

		<label class="save-to-library">
			<input type="checkbox" bind:checked={$form.saveToLibrary} />
			<span>Save to my characters, to use in other daydreams</span>
		</label>
		{#if inLibrary && $form.saveToLibrary}
			<p class="hint">
				This changes them in your library too{castingEdit ? ', though not their part in this daydream' : ''}.
			</p>
		{/if}

		{#if problem}<SuggestionProblem {problem} {debug} />{/if}

		<div class="buttons">
			<wa-button appearance="plain" onclick={close}>Cancel</wa-button>
			<wa-button
				type="submit"
				appearance={canSave ? 'filled' : 'outlined'}
				variant={canSave ? 'brand' : 'neutral'}
				disabled={$submitting}
			>
				{existing ? 'Save changes' : 'Add character'}
			</wa-button>
		</div>
	</form>
</wa-dialog>

<style>
	.character-dialog {
		--width: min(40rem, 100vw);
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* The two halves of a character met from a daydream. From the library
	   there is only one, so its box and heading go. */
	.section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin: 0;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 0.6rem;
		padding: 0.75rem;

		> legend {
			padding-inline: 0.35rem;
			font-weight: 600;
		}

		&.bare {
			border: 0;
			padding: 0;
		}
	}

	.detail::part(content) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.templates .template-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.hint {
		margin: 0 0 0.375rem;
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}

	.dials {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 0.6rem;
		padding: 0.75rem;

		legend {
			padding-inline: 0.35rem;
			font-weight: 600;
		}
	}

	.tones {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		border: 0;
	}

	/* A tone's look is `.choice-chip` (choice-controls.css), the same size
	   as the trait chips: it was a size larger, inheriting a form control's
	   height from Web Awesome's native button styles. */

	/* How sexual and how kinky a starting point is, said on it, so nobody
	   picks one blind. Quiet, beside the name it qualifies. */
	.level {
		margin-inline-start: 0.4em;
		font-size: 0.75rem;
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
