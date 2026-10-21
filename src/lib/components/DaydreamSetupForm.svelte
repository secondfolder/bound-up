<script lang="ts">
	import type { WaSelectEvent } from '@awesome.me/webawesome/dist/events/select.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import {
		CHARACTER_TEXT_FIELDS,
		DAYDREAM_LEADS,
		DAYDREAM_LIMITS,
		DAYDREAM_NARRATORS,
		DAYDREAM_STANCES,
		DAYDREAM_VOICE_PRESETS,
		type DaydreamCharacter,
		type DaydreamCharacterCopy,
		type DaydreamIdeaCopy,
		type DaydreamSetup,
		type DaydreamVoice,
		DEFAULT_STORY_DIALS,
		type DialValue,
		EMPTY_CASTING,
		fitCastingToIdea,
		inferVoice,
		leadApplies,
		MAX_DAYDREAM_CHARACTERS,
		voicePreset,
		voiceProblem
	} from '$lib/daydream';
	import { type CopyState, copyState } from '$lib/daydream/chips';
	import { saveLibraryItem, sealSetupExchanges } from '$lib/daydream/client';
	import { IDEA_SLIDERS } from '$lib/daydream/dial-words';
	import type { SetupExchange } from '$lib/daydream/setup-exchange';
	import { type SuggestContext, suggestCasting } from '$lib/daydream/suggest';
	import { type MarkedSummary, setupSummary } from '$lib/daydream/summary';
	import { type DaydreamSetupFormValues, daydreamSetupFormSchema } from '$lib/schemas/daydreamForm';
	import { sealForSubmit } from '$lib/sealed-forms';
	import { type DaydreamSetupContent, daydreamSetupKind } from '$lib/sealed-kinds/daydreams';
	import { openedDaydreamCharacter, openedDaydreamIdea } from '$lib/sealed-views.svelte';
	import { superForm } from '$lib/superform';
	import type { DaydreamLibraryItemView, DaydreamLibraryView, SealedRefView } from '$lib/types';
	import DaydreamCharacterDialog, { type CastingEdit } from './DaydreamCharacterDialog.svelte';
	import DaydreamCopyCard from './DaydreamCopyCard.svelte';
	import DaydreamDials from './DaydreamDials.svelte';
	import DaydreamIdeaDialog from './DaydreamIdeaDialog.svelte';
	import DaydreamPicturesControl from './DaydreamPicturesControl.svelte';
	import DaydreamVoicePicker from './DaydreamVoicePicker.svelte';
	import { startOpen } from './details';
	import SummaryBlank from './SummaryBlank.svelte';

	/**
	 * A daydream's setup: how it is told, the idea, who is in it, and what
	 * must not happen. Characters and ideas come from the user's library, or
	 * are made new in a dialog; the daydream keeps a copy of each, and offers
	 * the newer version when the library's has changed.
	 *
	 * Two layouts of the same form. **Full** is every control: the idea, who
	 * is in it, "More options" (who leads, the limits, the dials), and how it
	 * is told last, as one line with a Change button. **Summary** is for a
	 * story that is already put together — a ready-made one, or one the model
	 * wrote from a sentence (`draft`) — and shows it as a short summary with
	 * blanks in it (`setupSummary`), which open the same menus and dialogs;
	 * "Customise everything" switches to the full layout with nothing lost,
	 * since it is the one superform either way. See docs/daydreams.md,
	 * "Starting one".
	 *
	 * How it is told follows who is in it until the user picks it themselves
	 * (`inferVoice`): nobody is a story told to you, anyone is talking with
	 * them. It is asked last because it is the hardest question to answer
	 * before knowing who is in the story, and the guess is usually right.
	 *
	 * Disclosures start open when editing a daydream that has changed what
	 * they hold, so nothing customised is ever hidden.
	 * There is no name to give it: the model names it after its opening
	 * (`DaydreamStory.nameIfUnnamed`), and it can be renamed here afterwards.
	 *
	 * Characters are cast into the idea's parts. Who a character is in this
	 * story — their part, who they are to the user, what they are doing — is
	 * their casting, kept on this daydream's copy and never in the library;
	 * see docs/daydreams.md, "Characters, ideas and casting".
	 *
	 * Sealed in the user's own vault before it is posted, like a self task
	 * (`SealedTaskEditor.svelte`); the action only ever sees the sealed record.
	 * The form's data is nested, so it posts as JSON (`dataType: 'json'`), and
	 * `onSubmit` replaces the whole post with the sealed record.
	 */
	let {
		setupForm,
		daydream = null,
		draft = null,
		summary = null,
		layout: startLayout = 'full',
		onretry,
		retrying = false,
		library,
		suggestionsOn,
		picturesAvailable = false,
		submitLabel,
		debug = false,
		setupExchanges = []
	}: {
		/** The empty form, as the load prepared it. */
		setupForm: SuperValidated<DaydreamSetupFormValues>;
		/** The daydream being edited, opened; null to create one. */
		daydream?: { id: string; revision: number; setup: DaydreamSetupContent } | null;
		/** A new daydream's setup to start from (a ready-made one, or the model's); null for an empty one. */
		draft?: DaydreamSetup | null;
		/**
		 * The model's summary of `draft`, its blanks marked; null to summarise
		 * it from its premise (a ready-made daydream, or a summary that could not
		 * be read).
		 */
		summary?: MarkedSummary | null;
		/** Which layout to show first. The summary is for a setup that is already put together. */
		layout?: 'summary' | 'full';
		/**
		 * "Try another": asks for the draft again, with the limits written so
		 * far, so they are kept. Only for one the model wrote.
		 */
		onretry?: (limits: string) => void;
		/** Whether "Try another" is waiting on its answer. */
		retrying?: boolean;
		library: DaydreamLibraryView;
		/** Whether the model may be asked for ideas (the disclosure has been accepted). */
		suggestionsOn: boolean;
		/** Whether this server makes pictures: only then is there a setting for them. */
		picturesAvailable?: boolean;
		submitLabel: string;
		/**
		 * Debug mode (docs/debug-mode.md): the summary shows the markers it
		 * was written with, around the blanks they made.
		 */
		debug?: boolean;
		/**
		 * How a new daydream's draft was written, in debug mode: kept with it
		 * when it is made, for its raw log (`setup-exchange.ts`). Ignored when
		 * editing one.
		 */
		setupExchanges?: readonly SetupExchange[];
	} = $props();

	// svelte-ignore state_referenced_locally
	// The starting layout; switching is the user's from then on.
	let layout = $state(startLayout);

	let problem = $state<string | null>(null);
	/**
	 * A new daydream's id, chosen here because the setup is sealed to it. Kept
	 * across attempts, so a retry after a lost response cannot make the
	 * daydream twice: the second is refused as a taken id.
	 */
	let newId: string | null = null;
	/** The setup exchanges' record ids, kept across attempts for the same reason. */
	let setupExchangeIds: string[] = [];

	const sameVoice = (a: DaydreamVoice, b: DaydreamVoice) =>
		a.narrator === b.narrator && a.stance === b.stance;

	// svelte-ignore state_referenced_locally
	// A stored daydream's voice was chosen, whatever it is. A draft's counts
	// as chosen only when it is not what the guess would have been anyway — a
	// ready-made "A system in charge" — so one that matches goes on following
	// who is in it as the cast changes.
	let voiceChosen = $state(
		daydream !== null ||
			(draft !== null && !sameVoice(draft.voice, inferVoice(draft.voice, draft.characters.length)))
	);

	// svelte-ignore state_referenced_locally
	// Captured once on purpose, as on every superform: the stores it returns are
	// the live connection. An edited daydream is mounted only once it is
	// opened, and gets an id of its own for the same reason
	// `SealedTaskEditor` gives one: superforms recognises its initial form by
	// identity, and the empty one still in `page.data` would otherwise be
	// written over the opened content.
	//
	// A new daydream starts with the voice that follows who is in it, worked
	// out here rather than set once mounted, which superforms would overwrite
	// with its initial data. A draft, or a new form so changed, gets an id of
	// its own for the same reason an opened one does, and a fresh one each
	// time, since the page mounts a new form for each draft it is handed.
	function startingForm(): SuperValidated<DaydreamSetupFormValues> {
		if (daydream) {
			return { ...setupForm, id: `${setupForm.id}:opened`, data: structuredClone(daydream.setup) };
		}
		// A snapshot: the page may hand over its own state, and a state proxy
		// cannot be cloned.
		const data = structuredClone(draft ? $state.snapshot(draft) : setupForm.data);
		if (!voiceChosen) {
			data.voice = inferVoice(data.voice, data.characters.length);
		}
		return { ...setupForm, id: `${setupForm.id}:new:${crypto.randomUUID()}`, data };
	}
	const initial = startingForm();

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
				problem =
					checked.errors.voice?._errors?.[0] ?? checked.errors.characters?._errors?.[0] ?? null;
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
			const exchanges = daydream ? [] : await sealedSetupExchanges();
			// Nothing of the setup goes in the post but the sealed record: the
			// inputs' own fields are taken out, and the JSON is replaced.
			for (const key of [...formData.keys()]) {
				formData.delete(key);
			}
			jsonData({
				...outcome.fields,
				...(daydream ? { expectedRevision: daydream.revision } : {}),
				...(exchanges.length > 0 ? { setupExchanges: exchanges } : {})
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

	/**
	 * The setup exchanges, sealed for the create. A snapshot, as the draft
	 * is: the page hands over its own state, which cannot be cloned to seal.
	 */
	async function sealedSetupExchanges() {
		const exchanges = ($state.snapshot(setupExchanges) as SetupExchange[]).map((exchange, index) => ({
			id: setupExchangeIds[index] ?? crypto.randomUUID(),
			exchange
		}));
		setupExchangeIds = exchanges.map(({ id }) => id);
		return await sealSetupExchanges(exchanges);
	}

	const { form, errors, submitting, tainted, isTainted } = superform;

	// svelte-ignore state_referenced_locally
	// Captured once, as the disclosures' starting state: open for a daydream
	// that has changed what they hold, closed for everything else.
	const customisedOptions =
		daydream !== null &&
		(daydream.setup.lead !== 'character' ||
			daydream.setup.limits.trim() !== '' ||
			daydream.setup.dials.intensity !== DEFAULT_STORY_DIALS.intensity ||
			daydream.setup.dials.pace !== DEFAULT_STORY_DIALS.pace ||
			daydream.setup.dials.length !== DEFAULT_STORY_DIALS.length);

	// ── how it's told ────────────────────────────────────────────────────────

	/** Until the user picks how it is told, it follows who is in it. */
	function syncVoice() {
		if (voiceChosen) {
			return;
		}
		const next = inferVoice($form.voice, $form.characters.length);
		if (!sameVoice(next, $form.voice)) {
			$form.voice = next;
		}
	}

	function chooseVoice(voice: DaydreamVoice) {
		voiceChosen = true;
		$form.voice = voice;
	}

	// svelte-ignore state_referenced_locally
	// The picker starts open for a voice no one-line summary can say well: a
	// combination no preset gives, or one with a name for the user.
	let voiceOpen = $state(
		daydream !== null &&
			(voicePreset(daydream.setup.voice) === undefined ||
				daydream.setup.voice.protagonistName.trim() !== '')
	);

	/** How it is told, in a few words: the preset's name, or the two settings'. */
	const voiceLabel = $derived.by(() => {
		const preset = voicePreset($form.voice);
		if (preset) {
			return preset.label;
		}
		const narrator = DAYDREAM_NARRATORS.find((choice) => choice.value === $form.voice.narrator);
		const stance = DAYDREAM_STANCES.find((choice) => choice.value === $form.voice.stance);
		return [narrator?.label, stance?.label.toLocaleLowerCase()].filter(Boolean).join(', ');
	});

	const voiceIssue = $derived(voiceProblem($form.voice, $form.characters.length));

	// ── the summary ──────────────────────────────────────────────────────────

	// svelte-ignore state_referenced_locally
	// The draft it was written for, as it came: what it is compared with to
	// tell whether it still describes the story.
	const written = summary && draft ? { marked: summary, draft: structuredClone(initial.data) } : null;
	const paragraphs = $derived(setupSummary($form, written));
	// Captured once, as `startOpen` asks.
	const limitsWritten = initial.data.limits.trim() !== '';
	const HEAT_SCALE = IDEA_SLIDERS.find((slider) => slider.key === 'heat')?.scale;

	function pickHeat(event: WaSelectEvent) {
		const value = selectedValue(event);
		const heat = value === 'any' ? null : (Number(value) as DialValue);
		$form.idea = { ...$form.idea, dials: { ...$form.idea.dials, heat } };
	}

	function pickVoice(event: WaSelectEvent) {
		const preset = DAYDREAM_VOICE_PRESETS.find((candidate) => candidate.id === selectedValue(event));
		if (preset) {
			chooseVoice({ ...$form.voice, ...preset.voice });
		}
	}

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
	let ideas = $state([...library.ideas]);
	const characterRevisions = $derived(new Map(characters.map((item) => [item.id, item])));
	const ideaRevisions = $derived(new Map(ideas.map((item) => [item.id, item])));

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
		story: $form.dials,
		narrator: $form.voice.narrator,
		ideaDials: $form.idea.dials
	});

	function characterSummary(character: DaydreamCharacterCopy): string {
		return [character.archetype, character.personality].filter(Boolean).join(' · ').slice(0, 140);
	}

	// ── dialogs ──────────────────────────────────────────────────────────────

	/**
	 * The character dialog: which one it edits (an index into the form's
	 * list), or a new one, and for a new one the part it is cast in.
	 */
	let characterDialog: { index: number | null; partId: string | null } | null = $state(null);
	let ideaDialog: { surprise: boolean; edit: boolean } | null = $state(null);

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
		syncVoice();
		rememberLibrary('characters', character, sealed);
	}

	/**
	 * A new or changed idea. Castings in a part it no longer has let go of
	 * the part and keep their words, which are still the user's to reuse.
	 */
	function putIdea(idea: DaydreamIdeaCopy, sealed?: SealedRefView) {
		$form.idea = idea;
		$form.characters = fitCastingToIdea($form.characters, idea.parts);
		rememberLibrary('ideas', idea, sealed);
	}

	/**
	 * After a save to the library, so the item and its new revision are known
	 * here without a reload: offered in the pickers, and compared against.
	 */
	function rememberLibrary(
		kind: 'characters' | 'ideas',
		copy: DaydreamCharacterCopy | DaydreamIdeaCopy,
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
		const list = kind === 'characters' ? characters : ideas;
		const next = [row, ...list.filter((item) => item.id !== row.id)];
		if (kind === 'characters') {
			characters = next;
		} else {
			ideas = next;
		}
	}

	/** A dropdown item's value: the property, which is what Svelte set on the upgraded element. */
	const selectedValue = (event: WaSelectEvent) =>
		(event.detail.item as HTMLElement & { value?: string }).value;

	/** Casts a library character, or opens a new one, into `partId` (null: no particular part). */
	function castFromLibrary(event: WaSelectEvent, partId: string | null) {
		const id = selectedValue(event);
		if (id === 'new') {
			characterDialog = { index: null, partId };
			return;
		}
		const entry = pickable.find((candidate) => candidate.item.id === id);
		if (entry?.opened) {
			putCharacter(null, {
				...entry.opened,
				sourceId: entry.item.id,
				sourceRevision: entry.item.revision,
				casting: { ...EMPTY_CASTING, partId }
			});
			void draftCasting(entry.item.id);
		}
	}

	function pickIdea(event: WaSelectEvent) {
		const id = selectedValue(event);
		const item = ideas.find((candidate) => candidate.id === id);
		const opened = item ? openedDaydreamIdea(item.sealed) : null;
		if (item && opened) {
			putIdea({ ...opened, sourceId: item.id, sourceRevision: item.revision });
		}
	}

	/** The library's newer version of a character: who they are, with their casting here kept. */
	function useLatestCharacter(index: number) {
		const copy = $form.characters[index];
		const item = copy?.sourceId ? characterRevisions.get(copy.sourceId) : undefined;
		const opened = item ? openedDaydreamCharacter(item.sealed) : null;
		if (copy && item && opened) {
			putCharacter(index, {
				...opened,
				sourceId: item.id,
				sourceRevision: item.revision,
				casting: copy.casting
			});
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
		kind: 'characters' | 'ideas',
		copy: DaydreamCharacterCopy | DaydreamIdeaCopy
	) {
		// A character's casting is this daydream's, never the library's.
		const { sourceId: _id, sourceRevision: _revision, ...rest } = copy;
		const { casting: _casting, ...content } = rest as typeof rest & { casting?: unknown };
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

	function ideaState(): CopyState {
		return copyState($form.idea, ideaRevisions);
	}

	const ideaChosen = $derived($form.idea.title.trim() !== '' && $form.idea.premise.trim() !== '');

	// ── casting ──────────────────────────────────────────────────────────────

	const partName = (partId: string | null) =>
		$form.idea.parts.find((part) => part.id === partId)?.name ?? null;

	/** The characters in no part, by their index in the list. */
	const uncast = $derived(
		$form.characters.flatMap((character, index) =>
			partName(character.casting.partId) === null ? [{ character, index }] : []
		)
	);

	function castSummary(character: DaydreamCharacterCopy): string {
		const { relationship, part } = character.casting;
		if (character.sourceId !== null && drafting.has(character.sourceId)) {
			return 'Writing their part…';
		}
		return (
			[relationship, part].filter(Boolean).join(' · ').slice(0, 160) || characterSummary(character)
		);
	}

	/** Library characters whose casting is being written, by library id. */
	const drafting = new SvelteSet<string>();

	/** Who `character` is in this story, asked of the model. `selfIndex` is them, to leave out of "others". */
	function writeCasting(
		character: Omit<DaydreamCharacter, 'dials'>,
		partId: string | null,
		selfIndex: number | null
	) {
		const part = $form.idea.parts.find((candidate) => candidate.id === partId);
		const { title, setting, premise, yourRole, tone } = $form.idea;
		return suggestCasting({
			character,
			idea: { title, setting, premise, yourRole, tone },
			ideaDials: $form.idea.dials,
			part: part ? { name: part.name, description: part.description } : null,
			others: $form.characters
				.filter((_, at) => at !== selfIndex)
				.map((other) => ({ name: other.name, part: partName(other.casting.partId) })),
			stance: $form.voice.stance,
			limits: $form.limits
		});
	}

	/**
	 * Writes the casting of a character just cast from the library, when the
	 * model may be asked and there is an idea to write it for. Background
	 * work nobody waits on, so a failure leaves the fields empty and says
	 * nothing; the dialog's "Write their part" is there to ask again. Only
	 * fills what is still empty when the answer comes, so a casting edited in
	 * the meantime is never written over.
	 */
	async function draftCasting(sourceId: string) {
		const cast = $form.characters.findIndex((candidate) => candidate.sourceId === sourceId);
		const character = $form.characters[cast];
		if (!(suggestionsOn && ideaChosen && character)) {
			return;
		}
		drafting.add(sourceId);
		const actor = Object.fromEntries(
			(['name', ...CHARACTER_TEXT_FIELDS] as const).map((field) => [field, character[field]])
		) as Omit<DaydreamCharacter, 'dials'>;
		const answer = await writeCasting(actor, character.casting.partId, cast);
		drafting.delete(sourceId);
		const index = $form.characters.findIndex((candidate) => candidate.sourceId === sourceId);
		const now = $form.characters[index];
		if (!(answer.ok && now)) {
			return;
		}
		const list = [...$form.characters];
		list[index] = {
			...now,
			casting: {
				...now.casting,
				relationship: now.casting.relationship.trim() || answer.value.relationship,
				part: now.casting.part.trim() || answer.value.part
			}
		};
		$form.characters = list;
	}

	/** The casting half of the character dialog, for the character at `index` (null: a new one). */
	function castingEdit(index: number | null, partId: string | null): CastingEdit {
		return {
			value:
				index === null
					? { ...EMPTY_CASTING, partId }
					: ($form.characters[index]?.casting ?? EMPTY_CASTING),
			parts: $form.idea.parts.map((part) => ({
				...part,
				takenBy:
					$form.characters.find(
						(character, at) => at !== index && character.casting.partId === part.id
					)?.name ?? null
			})),
			write:
				suggestionsOn && ideaChosen
					? (character, chosen) => writeCasting(character, chosen, index)
					: undefined
		};
	}
	const showLead = $derived(leadApplies($form.voice, $form.characters.length));
	const charactersNote = $derived.by(() => {
		if (!voiceChosen) {
			return 'Who is in the daydream. With nobody, it is told to you.';
		}
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

{#snippet castCard(character: DaydreamCharacterCopy, index: number)}
	<DaydreamCopyCard
		title={character.name}
		summary={castSummary(character)}
		state={copyState(character, characterRevisions)}
		kindName="characters"
		onedit={() => {
			characterDialog = { index, partId: character.casting.partId };
		}}
		onremove={() => {
			$form.characters = $form.characters.filter((_, at) => at !== index);
			syncVoice();
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
{/snippet}

{#snippet castPicker(label: string, partId: string | null)}
	<wa-dropdown onwa-select={(event: WaSelectEvent) => castFromLibrary(event, partId)}>
		<wa-button slot="trigger" size="s" appearance="outlined" with-caret>
			<wa-icon slot="start" name="user-plus" variant="solid"></wa-icon>
			{label}
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
{/snippet}

{#snippet submit()}
	<wa-button
		type="submit"
		appearance={canSave ? 'filled' : 'outlined'}
		variant={canSave ? 'brand' : 'neutral'}
		disabled={$submitting}
	>
		{submitLabel}
	</wa-button>
{/snippet}

<!-- The limits textarea, shared by both layouts: only one is ever on screen. -->
{#snippet limitsField()}
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
		While it plays, “Stop” and “Ease off” are always there, and selecting words and
		choosing “Not this” adds them here.
	</p>
{/snippet}

<form method="POST" use:superform.enhance class="panel">
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}

	{#if layout === 'summary'}
		<div class="summary-view">
			<!-- Written with no whitespace between the pieces: any there would
			     render as a space, and put one before the full stop. The words
			     between the blanks carry their own spaces (`.words`). Each blank
			     is a `SummaryBlank`: words, with an invisible button over them,
			     so a copy of the summary keeps them. In debug mode each blank
			     from a marked summary is shown inside its marker, `[[key|…]]`,
			     and a marker read as plain words is shown in full. -->
			<div class="setup-summary">
				{#each paragraphs as pieces, at (at)}<p>{#each pieces as piece, index (index)}{#if piece.kind === 'text'}{#if debug && piece.marker}<span class="marker">{piece.marker}</span>{:else}<span class="words">{piece.text}</span>{/if}{:else}{#if debug && piece.key}<span class="marker">[[{piece.key}|</span>{/if}{#if piece.kind === 'heat'}<SummaryBlank
							label={piece.label}
							name={`How sexual: ${piece.label}`}
							onselect={pickHeat}
							>{#snippet items()}<wa-dropdown-item value="any">Any kind</wa-dropdown-item
								>{#if HEAT_SCALE}{#each [1, 2, 3, 4, 5] as const as level (level)}<wa-dropdown-item value={String(level)}
											>{HEAT_SCALE[level].label}</wa-dropdown-item
										>{/each}{/if}{/snippet}</SummaryBlank
						>{:else if piece.kind === 'voice'}<SummaryBlank
							label={piece.label}
							name={`How it's told: ${voiceLabel}`}
							onselect={pickVoice}
							>{#snippet items()}{#each DAYDREAM_VOICE_PRESETS as preset (preset.id)}<wa-dropdown-item value={preset.id}
										>{preset.label}</wa-dropdown-item
									>{/each}{/snippet}</SummaryBlank
						>{:else if piece.kind === 'character'}<SummaryBlank
							label={piece.label}
							onclick={() => {
								characterDialog = {
									index: piece.index,
									partId: $form.characters[piece.index]?.casting.partId ?? null
								};
							}}
						/>{:else}<SummaryBlank
							label={piece.label}
							onclick={() => {
								ideaDialog = { surprise: false, edit: true };
							}}
						/>{/if}{#if debug && piece.key}<span class="marker">]]</span>{/if}{/if}{/each}</p>{/each}
			</div>
			{#if $form.characters.length < MAX_DAYDREAM_CHARACTERS}
				<div>{@render castPicker('Add someone', null)}</div>
			{/if}
			{#if voiceIssue}<p class="invalid" role="status">{voiceIssue}</p>{/if}
			{#if $errors.characters?._errors}
				<span class="invalid">{$errors.characters._errors[0]}</span>
			{/if}
			<wa-details summary="Anything off the table?" class="limits" {@attach startOpen(limitsWritten)}>
				{@render limitsField()}
			</wa-details>
		</div>

		<div class="actions">
			{@render submit()}
			{#if onretry}
				<wa-button appearance="outlined" disabled={retrying} onclick={() => onretry($form.limits)}>
					<wa-icon slot="start" name="rotate" variant="solid"></wa-icon>
					{retrying ? 'Writing another…' : 'Try another'}
				</wa-button>
			{/if}
			<wa-button
				appearance="plain"
				onclick={() => {
					layout = 'full';
				}}
			>
				<wa-icon slot="start" name="sliders" variant="solid"></wa-icon>
				Customise everything
			</wa-button>
		</div>
	{:else}
		<!-- Only once there is a daydream to rename: a new one is named by the
		     model after its opening, and nobody should have to think of a name
		     before they have started. -->
		{#if daydream}
			<InputField
				{superform}
				field="title"
				type="text"
				title="Name"
				maxlength={DAYDREAM_LIMITS.title}
			/>
			<p class="hint name-hint">Leave it empty to have it named for you.</p>
		{/if}

		<fieldset>
			<legend>The idea</legend>
			{#if ideaChosen}
				<DaydreamCopyCard
					title={$form.idea.title}
					summary={$form.idea.premise.slice(0, 160)}
					state={ideaState()}
					kindName="ideas"
					onedit={() => {
						ideaDialog = { surprise: false, edit: true };
					}}
					onuselatest={() => {
						const item = $form.idea.sourceId ? ideaRevisions.get($form.idea.sourceId) : undefined;
						const opened = item ? openedDaydreamIdea(item.sealed) : null;
						if (item && opened) {
							putIdea({ ...opened, sourceId: item.id, sourceRevision: item.revision });
						}
					}}
					latestReady={latestOpened(ideaRevisions, $form.idea.sourceId, openedDaydreamIdea)}
					onkeep={() => {
						const item = $form.idea.sourceId ? ideaRevisions.get($form.idea.sourceId) : undefined;
						if (item) {
							putIdea({ ...$form.idea, sourceRevision: item.revision });
						}
					}}
					onsave={async () => {
						const saved = await saveCopy('ideas', $form.idea);
						if (saved) {
							putIdea(saved.copy as DaydreamIdeaCopy, saved.sealed);
						}
					}}
				/>
			{:else}
				<p class="hint">Where it happens and what is going on.</p>
			{/if}
			<div class="idea-choices">
				{#if ideas.length > 0}
					<wa-dropdown onwa-select={pickIdea}>
						<wa-button slot="trigger" size="s" appearance="outlined" with-caret>Choose a saved idea</wa-button>
						{#each ideas as item (item.id)}
							{const opened = $derived(openedDaydreamIdea(item.sealed))}
							<wa-dropdown-item value={item.id} disabled={!opened}>
								{opened?.title ?? notShown(opened)}
							</wa-dropdown-item>
						{/each}
					</wa-dropdown>
				{/if}
				<wa-button size="s" appearance="outlined" onclick={() => {
					ideaDialog = { surprise: false, edit: false };
				}}>
					<wa-icon slot="start" name="plus" variant="solid"></wa-icon>
					New idea
				</wa-button>
				{#if suggestionsOn}
					<wa-button size="s" appearance="outlined" onclick={() => {
						ideaDialog = { surprise: true, edit: false };
					}}>
						<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>
						Surprise me
					</wa-button>
				{/if}
			</div>
			{#if $errors.idea?.premise || $errors.idea?.title}
				<span class="invalid">Choose an idea, or make one.</span>
			{/if}
		</fieldset>

		<fieldset>
			<legend>Who's in it</legend>
			<p class="hint">{charactersNote}</p>
			{#each $form.idea.parts as part (part.id)}
				{const index = $derived($form.characters.findIndex((character) => character.casting.partId === part.id))}
				{const player = $derived($form.characters[index])}
				<div class="part">
					<div class="part-name">
						<strong>{part.name}</strong>
						{#if part.description}<span class="hint">{part.description}</span>{/if}
					</div>
					{#if player}
						{@render castCard(player, index)}
					{:else if $form.characters.length < MAX_DAYDREAM_CHARACTERS}
						{@render castPicker(`Cast ${part.name}`, part.id)}
					{/if}
				</div>
			{/each}
			{#each uncast as { character, index } (character.sourceId ?? `copy-${index}`)}
				{@render castCard(character, index)}
			{/each}
			{#if $form.characters.length < MAX_DAYDREAM_CHARACTERS}
				{@render castPicker(
					$form.idea.parts.length > 0 ? 'Add someone else' : 'Add a character',
					null
				)}
			{/if}
			{#if $errors.characters?._errors}
				<span class="invalid">{$errors.characters._errors[0]}</span>
			{/if}
		</fieldset>

		<wa-details summary="More options" class="more" {@attach startOpen(customisedOptions)}>
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
				{@render limitsField()}
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

			{#if picturesAvailable}
				<fieldset>
					<legend>Pictures</legend>
					<DaydreamPicturesControl
						name="setup-picture-style"
						value={$form.pictures}
						onchange={(pictures) => {
							$form.pictures = pictures;
						}}
					/>
				</fieldset>
			{/if}
		</wa-details>

		<!-- Last, and as one line: by now who is in it is known, and the guess
		     it makes from them is usually right. -->
		<fieldset class="told">
			<legend>How it's told</legend>
			{#if voiceOpen}
				<DaydreamVoicePicker
					value={$form.voice}
					characterCount={$form.characters.length}
					onchange={chooseVoice}
				/>
			{:else}
				<div class="told-summary">
					<p>
						<strong>{voiceLabel}</strong>
						{#if !voiceChosen}<span class="hint">Picked from who’s in it.</span>{/if}
					</p>
					<wa-button
						size="s"
						appearance="outlined"
						onclick={() => {
							voiceOpen = true;
						}}
					>
						Change
					</wa-button>
				</div>
				<!-- The picker shows its own problem; closed, it is said here, so a
				     closed picker never hides why the form will not save. -->
				{#if voiceIssue}<p class="invalid" role="status">{voiceIssue}</p>{/if}
			{/if}
		</fieldset>

		{@render submit()}
	{/if}
</form>

<!-- Outside the form: each dialog is a form of its own, and forms do not nest. -->
{#if characterDialog}
	{const index = $derived(characterDialog.index)}
	{const editing = $derived(index === null ? null : ($form.characters[index] ?? null))}
	<DaydreamCharacterDialog
		{debug}
		character={editing}
		libraryRevision={editing?.sourceId ? (characterRevisions.get(editing.sourceId)?.revision ?? null) : null}
		casting={castingEdit(index, characterDialog.partId)}
		{context}
		{suggestionsOn}
		onsaved={(character, sealed) => putCharacter(index, character, sealed)}
		onclose={() => {
			characterDialog = null;
		}}
	/>
{/if}
{#if ideaDialog}
	{const editing = $derived(ideaDialog.edit ? $form.idea : null)}
	<DaydreamIdeaDialog
		{debug}
		idea={editing}
		libraryRevision={editing?.sourceId ? (ideaRevisions.get(editing.sourceId)?.revision ?? null) : null}
		surprise={ideaDialog.surprise}
		{context}
		{suggestionsOn}
		onsaved={putIdea}
		onclose={() => {
			ideaDialog = null;
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

	.name-hint {
		margin-block-start: -0.75rem;
	}

	/* An idea part, and who plays it. */
	.part {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;

		.part-name {
			display: flex;
			flex-direction: column;
		}
	}

	.more::part(content) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.idea-choices {
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

	.told-summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;

		p {
			margin: 0;
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 0.25rem 0.75rem;
		}
	}

	/* The setup as a summary with blanks in it. */
	.summary-view {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.setup-summary {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 1.125rem;
		line-height: 1.8;

		p {
			margin: 0;
		}

		.words {
			white-space: pre-wrap;
		}
	}

	/* A marker the summary was written with, shown in debug mode. */
	.marker {
		font-family: var(--wa-font-family-code, monospace);
		font-size: 0.85em;
		color: var(--wa-color-text-quiet);
		white-space: pre-wrap;
	}

	.limits::part(content) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
