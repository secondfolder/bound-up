<script lang="ts">
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import {
		CHARACTER_TEXT_FIELDS,
		type CharacterDials,
		type CharacterTextField,
		type CharacterTone,
		DAYDREAM_LIMITS,
		type DaydreamCharacterCopy,
		type DialValue,
		EMPTY_CHARACTER
	} from '$lib/daydream';
	import {
		CHARACTER_CHIPS,
		CHARACTER_FIELD_LABELS,
		CHARACTER_TEMPLATES
	} from '$lib/daydream/catalog';
	import { saveLibraryItem } from '$lib/daydream/client';
	import { CHARACTER_SLIDERS, CHARACTER_TONES } from '$lib/daydream/dial-words';
	import { type SuggestContext, suggestChips, suggestFill } from '$lib/daydream/suggest';
	import {
		type DaydreamCharacterFormValues,
		daydreamCharacterFormSchema
	} from '$lib/schemas/daydreamForm';
	import { superForm } from '$lib/superform';
	import type { SealedRefView } from '$lib/types';
	import DaydreamChipField from './DaydreamChipField.svelte';

	/**
	 * Making or changing a character, in a dialog over whatever page wanted
	 * one: the setup form, or the character library.
	 *
	 * Guided rather than a blank form: starting points to begin from, dials
	 * for the broad strokes (a tone, and how much they take charge, how
	 * strict, how cruel, how much they talk), and chips under every field. The
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
		context,
		suggestionsOn,
		onsaved,
		onclose
	}: {
		/** The character being changed; null for a new one. */
		character?: DaydreamCharacterCopy | null;
		/** The library's revision of `character.sourceId`, when it is in the library. */
		libraryRevision?: number | null;
		/** The daydream around it, for suggestions. */
		context: SuggestContext;
		/** Whether the model may be asked for ideas (the disclosure has been accepted). */
		suggestionsOn: boolean;
		/** The character as saved: a copy for a daydream, with where it came from. */
		/** The sealed library record too, when it was saved there. */
		onsaved: (character: DaydreamCharacterCopy, sealed?: SealedRefView) => void;
		onclose: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captured once, as every superform is: the dialog is opened afresh for each character.
	const existing = character;
	// svelte-ignore state_referenced_locally
	const knownRevision = libraryRevision;
	const inLibrary = existing?.sourceId !== null && knownRevision !== null;

	const start: DaydreamCharacterFormValues = existing
		? {
				name: existing.name,
				archetype: existing.archetype,
				personality: existing.personality,
				speech: existing.speech,
				appearance: existing.appearance,
				relationship: existing.relationship,
				likes: existing.likes,
				notes: existing.notes,
				dials: existing.dials,
				// Ticked for one already in the library; a copy kept only in a
				// daydream stays that way unless asked.
				saveToLibrary: inLibrary
			}
		: { ...EMPTY_CHARACTER, saveToLibrary: true };

	let problem: string | null = $state(null);
	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();

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
			const { saveToLibrary, ...fields } = submitted.data;
			const content = { ...fields, name: fields.name.trim() };
			if (!saveToLibrary) {
				// Kept only in the daydream: a copy with no library record, so it
				// never claims to match one it no longer does.
				onsaved({ ...content, sourceId: null, sourceRevision: null });
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
		}
	}

	function setTone(tone: CharacterTone | null) {
		$form.dials = { ...$form.dials, tone: $form.dials.tone === tone ? null : tone };
	}

	function setDial(key: Exclude<keyof CharacterDials, 'tone'>, level: DialValue | null) {
		$form.dials = { ...$form.dials, [key]: level };
	}

	type WaSlider = HTMLElement & { value: number; valueFormatter?: (value: number) => string };
	function slider(key: Exclude<keyof CharacterDials, 'tone'>) {
		const scale = CHARACTER_SLIDERS.find((entry) => entry.key === key)?.scale;
		return (node: WaSlider) => {
			node.valueFormatter = (level) => scale?.[level as DialValue]?.label ?? String(level);
			const update = () => setDial(key, Math.round(node.value) as DialValue);
			node.addEventListener('change', update);
			return () => node.removeEventListener('change', update);
		};
	}

	let filling = $state(false);
	async function fillTheRest() {
		filling = true;
		problem = null;
		const answer = await suggestFill({ target: 'character', draft, dials: $form.dials, context });
		filling = false;
		if (!answer.ok) {
			problem = answer.error;
			return;
		}
		// Only the empty fields: never over what was written.
		const next = { ...$form };
		for (const field of ['name', ...CHARACTER_TEXT_FIELDS] as const) {
			const text = answer.value[field];
			if (text && next[field].trim() === '') {
				next[field] = text;
			}
		}
		$form = next;
	}

	function moreIdeas(field: CharacterTextField) {
		return () => suggestChips({ target: 'character', field, draft, dials: $form.dials, context });
	}

	const LIMIT_OF: Record<CharacterTextField, number> = {
		archetype: DAYDREAM_LIMITS.archetype,
		personality: DAYDREAM_LIMITS.personality,
		speech: DAYDREAM_LIMITS.speech,
		appearance: DAYDREAM_LIMITS.appearance,
		relationship: DAYDREAM_LIMITS.relationship,
		likes: DAYDREAM_LIMITS.likes,
		notes: DAYDREAM_LIMITS.characterNotes
	};
</script>

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
						<wa-button size="s" appearance="outlined" onclick={() => useTemplate(template.id)}>
							{template.label}
						</wa-button>
					{/each}
				</div>
			</section>
		{/if}

		<InputField
			{superform}
			field="name"
			type="text"
			title="Their name"
			maxlength={DAYDREAM_LIMITS.characterName}
			required
		/>

		<fieldset class="dials">
			<legend>In broad strokes</legend>
			<fieldset class="tones">
				<legend class="wa-visually-hidden">Tone</legend>
				{#each CHARACTER_TONES as tone (tone.value)}
					<!-- A toggle: a native button, because wa-button forwards no aria-pressed. -->
					<button
						type="button"
						class="tone"
						aria-pressed={$form.dials.tone === tone.value}
						onclick={() => setTone(tone.value)}
					>
						{tone.label}
					</button>
				{/each}
			</fieldset>
			{#each CHARACTER_SLIDERS as entry (entry.key)}
				{const level = $derived($form.dials[entry.key])}
				<div class="dial" class:unset={level === null}>
					<wa-slider {@attach slider(entry.key)} label={entry.label} min={1} max={5} step={1} value={level ?? 3}>
						<span slot="reference">{entry.low}</span>
						<span slot="reference">{entry.high}</span>
					</wa-slider>
					<div class="reading">
						<span>{level === null ? 'Not set' : entry.scale[level].label}</span>
						{#if level !== null}
							<wa-button size="s" appearance="plain" onclick={() => setDial(entry.key, null)}>
								Clear {entry.label.toLowerCase()}
							</wa-button>
						{/if}
					</div>
				</div>
			{/each}
		</fieldset>

		{#each CHARACTER_TEXT_FIELDS as field (field)}
			<DaydreamChipField
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
		{/each}

		{#if suggestionsOn}
			<wa-button class="fill" size="s" appearance="outlined" disabled={filling} onclick={fillTheRest}>
				<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>
				{filling ? 'Filling in…' : 'Fill in the rest'}
			</wa-button>
		{/if}

		<label class="save-to-library">
			<input type="checkbox" bind:checked={$form.saveToLibrary} />
			<span>Save to my characters, to use in other daydreams</span>
		</label>
		{#if inLibrary && $form.saveToLibrary}
			<p class="hint">This changes them in your library too.</p>
		{/if}

		{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}

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

	.tone {
		padding: 0.3rem 0.85rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 999px;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;

		&[aria-pressed='true'] {
			background: var(--wa-color-brand-fill-quiet);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.dial {
		.reading {
			display: flex;
			align-items: center;
			justify-content: space-between;
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}

		/* An unset dial says nothing about the character, so it reads as off. */
		&.unset wa-slider {
			opacity: 0.55;
		}
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
