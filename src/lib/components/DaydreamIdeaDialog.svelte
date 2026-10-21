<script lang="ts">
	import { onMount } from 'svelte';
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import {
		DAYDREAM_LIMITS,
		type DaydreamField,
		type DaydreamIdeaCopy,
		type DialValue,
		EMPTY_IDEA,
		IDEA_FIELD_KINDS,
		IDEA_ORIGIN_FIELDS,
		type IdeaCoreField,
		type IdeaDials,
		type IdeaFieldKind,
		type IdeaOriginField,
		type IdeaPart,
		knownField,
		MAX_DAYDREAM_CHARACTERS,
		namedFields,
		newIdeaFields
	} from '$lib/daydream';
	import {
		IDEA_CHIPS,
		IDEA_ORIGIN_LABELS,
		IDEA_TEMPLATES,
		ideaFieldLabels
	} from '$lib/daydream/catalog';
	import { saveLibraryItem } from '$lib/daydream/client';
	import { IDEA_SLIDERS, ideaLevel } from '$lib/daydream/dial-words';
	import {
		type SuggestContext,
		type SuggestFailure,
		suggestChips,
		suggestFill,
		surpriseIdea
	} from '$lib/daydream/suggest';
	import { withSuggestedFields } from '$lib/daydream/suggestions';
	import { type DaydreamIdeaFormValues, daydreamIdeaFormSchema } from '$lib/schemas/daydreamForm';
	import { superForm } from '$lib/superform';
	import type { SealedRefView } from '$lib/types';
	import DaydreamChipField from './DaydreamChipField.svelte';
	import DaydreamFieldList from './DaydreamFieldList.svelte';
	import { startOpen } from './details';
	import OptionalSlider from './OptionalSlider.svelte';
	import SuggestionProblem from './SuggestionProblem.svelte';

	/**
	 * Making or changing an idea, in a dialog, the way
	 * `DaydreamCharacterDialog` makes a character: starting points, chips
	 * under every field, the model's ideas when suggestions are on, and the
	 * free text the truth. With `surprise`, the model writes the whole idea
	 * first — from the characters, the limits and the dials — and it opens
	 * here to read, change, or try again before it is used.
	 *
	 * Up front: the title, what is going on, its fields (`DaydreamFieldList`:
	 * where and the tone to start with, a monologue's sayings first, then
	 * whatever the user adds), how sexual and how kinky it is, and the parts
	 * it has for characters, which is what a daydream casts them into. Heat
	 * and kink are up front because they decide what kind of story it is —
	 * SFW or filthy — more than any other field. The user's part is under
	 * "More detail", which starts open when it is filled. So is where it came
	 * from — the brief it was written from and the research behind it — for an
	 * idea that has either; those alone do not open it, since nobody
	 * customised them.
	 *
	 * An SPA superform saving through `api/daydreams/ideas`, for the reason
	 * the character dialog gives.
	 */
	let {
		idea = null,
		libraryRevision = null,
		surprise = false,
		context,
		suggestionsOn,
		debug = false,
		onsaved,
		onclose
	}: {
		idea?: DaydreamIdeaCopy | null;
		libraryRevision?: number | null;
		/** Start with an idea the model makes up ("Surprise me"). */
		surprise?: boolean;
		context: SuggestContext;
		suggestionsOn: boolean;
		/** Debug mode: a failed suggestion shows what came back. */
		debug?: boolean;
		onsaved: (idea: DaydreamIdeaCopy, sealed?: SealedRefView) => void;
		onclose: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	const existing = idea;
	// svelte-ignore state_referenced_locally
	const knownRevision = libraryRevision;
	// svelte-ignore state_referenced_locally
	const surprising = surprise;
	const inLibrary = existing?.sourceId !== null && knownRevision !== null;

	// How the daydream around it is told, as it was when the dialog opened: a
	// monologue's idea asks for its sayings first, in words of its own.
	// svelte-ignore state_referenced_locally
	const { narrator } = context;
	const labels = ideaFieldLabels(narrator);

	const start: DaydreamIdeaFormValues = existing
		? {
				title: existing.title,
				premise: existing.premise,
				yourRole: existing.yourRole,
				fields: existing.fields.map((field) => ({ ...field })),
				brief: existing.brief,
				research: existing.research,
				parts: existing.parts.map((part) => ({ ...part })),
				openings: existing.openings.map((opening) => ({ ...opening })),
				trackers: existing.trackers.map((tracker) => ({ ...tracker })),
				dials: { ...existing.dials },
				saveToLibrary: inLibrary
			}
		: {
				...EMPTY_IDEA,
				fields: newIdeaFields(narrator).map((kind) => knownField(kind)),
				saveToLibrary: true
			};

	let problem: SuggestFailure | null = $state(null);
	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();
	let detail: (HTMLElement & { open: boolean }) | undefined = $state();

	const detailFilled = (values: Pick<DaydreamIdeaFormValues, 'yourRole'>) =>
		values.yourRole.trim() !== '';
	const startsDetailed = detailFilled(start);
	// Only for an idea that came with them: an empty "What you asked for" on
	// an idea written by hand would ask for something nobody needs to write.
	const ORIGIN_FIELDS = IDEA_ORIGIN_FIELDS.filter((field) => start[field].trim() !== '');

	/** Opens "More detail" when something just wrote into it, so what changed is in view. */
	function revealDetail() {
		if (detail && detailFilled($form)) {
			detail.open = true;
		}
	}

	/** The dials the user has set, with the model's ideas only where they left one unset. */
	const keepSetDials = (suggested: IdeaDials): IdeaDials => ({
		heat: $form.dials.heat ?? suggested.heat,
		kink: $form.dials.kink ?? suggested.kink
	});

	function setDial(key: keyof IdeaDials, level: DialValue | null) {
		$form.dials = { ...$form.dials, [key]: level };
	}

	/** Parts, openings or trackers from a template or the model, with ids of their own. */
	const withIds = <T extends object>(items: readonly T[]): (T & { id: string })[] =>
		items.map((item) => ({ ...item, id: crypto.randomUUID() }));

	const superform = superForm(defaults(start, zod4Client(daydreamIdeaFormSchema)), {
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
		validators: zod4Client(daydreamIdeaFormSchema),
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
			const saved = await saveLibraryItem('ideas', {
				id,
				content,
				expectedRevision: inLibrary ? knownRevision : null
			});
			if (!saved.ok) {
				problem = { error: saved.error };
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
		(existing === null || isTainted($tainted)) && daydreamIdeaFormSchema.safeParse($form).success
	);

	/**
	 * The idea as a suggestion is told it: the core, and every known field it
	 * has, empty ones included (`DaydreamCharacterDialog`'s `draft`).
	 */
	const draft = $derived({
		title: $form.title,
		premise: $form.premise,
		yourRole: $form.yourRole,
		...Object.fromEntries(
			$form.fields.flatMap((field) => (field.kind === null ? [] : [[field.kind, field.value]]))
		)
	} as Record<string, string>);
	const named = $derived(namedFields($form.fields));

	const empty = $derived(
		[$form.title, $form.premise, $form.yourRole].every((text) => text.trim() === '') &&
			$form.fields.every((field) => field.value.trim() === '') &&
			$form.parts.length === 0
	);

	function useTemplate(id: string) {
		const template = IDEA_TEMPLATES.find((entry) => entry.id === id);
		if (template) {
			$form = {
				...$form,
				...template.idea,
				parts: withIds(template.idea.parts),
				openings: withIds(template.idea.openings),
				trackers: withIds(template.idea.trackers)
			};
			revealDetail();
		}
	}

	// ── parts ────────────────────────────────────────────────────────────────

	function addPart() {
		$form.parts = [...$form.parts, { id: crypto.randomUUID(), name: '', description: '' }];
	}

	function setPart(index: number, patch: Partial<IdeaPart>) {
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

	/** A whole idea from the model, in place of what is in the form. */
	async function makeOneUp() {
		thinking = true;
		problem = null;
		const answer = await surpriseIdea(context, $form.dials);
		thinking = false;
		if (answer.ok) {
			$form = {
				...$form,
				...answer.value,
				parts: withIds(answer.value.parts),
				openings: withIds(answer.value.openings),
				trackers: withIds(answer.value.trackers),
				dials: keepSetDials(answer.value.dials)
			};
			revealDetail();
		} else {
			problem = answer;
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
			target: 'idea',
			draft,
			parts: namedParts(),
			named,
			ideaDials: $form.dials,
			context
		});
		thinking = false;
		if (!answer.ok) {
			problem = answer;
			return;
		}
		const { fields: filled } = answer.value;
		const next = { ...$form };
		for (const key of ['title', 'premise', 'yourRole'] as const) {
			const text = filled[key];
			if (text && next[key].trim() === '') {
				next[key] = text;
			}
		}
		// Only the empty fields the idea has: never over what was written.
		next.fields = withSuggestedFields(
			next.fields.map((field) => {
				const text = field.kind === null ? undefined : filled[field.kind];
				return text && field.value.trim() === '' ? { ...field, value: text } : field;
			}),
			answer.value.named
		);
		// Parts, openings and trackers only for an idea that had none: never
		// over the ones written.
		if (next.parts.length === 0) {
			next.parts = withIds(answer.value.parts);
		}
		if (next.openings.length === 0) {
			next.openings = withIds(answer.value.openings);
		}
		if (next.trackers.length === 0) {
			next.trackers = withIds(answer.value.trackers);
		}
		next.dials = keepSetDials(answer.value.ideaDials);
		$form = next;
		revealDetail();
	}

	/** The parts with a name so far, for the model to fit its ideas to. */
	const namedParts = () =>
		$form.parts
			.filter((part) => part.name.trim() !== '')
			.map(({ name, description }) => ({ name, description }));

	function moreIdeas(field: IdeaCoreField) {
		return () =>
			suggestChips({
				target: 'idea',
				field,
				draft,
				parts: namedParts(),
				named,
				ideaDials: $form.dials,
				context
			});
	}

	/** More chips for one of the fields: a known kind by name, one the user named by its name. */
	function moreFieldIdeas(field: DaydreamField<IdeaFieldKind>) {
		return suggestChips({
			target: 'idea',
			field: field.kind ?? 'named',
			...(field.kind === null ? { label: field.label } : {}),
			draft,
			parts: namedParts(),
			named,
			ideaDials: $form.dials,
			context
		});
	}

	/** The fields' errors by their place in the list, as superforms gives them. */
	const fieldErrors = $derived(
		$errors.fields as Record<number, { label?: string[]; value?: string[] }> | undefined
	);

	function labelFor(): string {
		if (surprising) {
			return 'A surprise';
		}
		return existing ? `Change “${existing.title}”` : 'A new idea';
	}
	const dialogLabel = labelFor();

	const LIMIT_OF: Record<IdeaCoreField, number> = {
		premise: DAYDREAM_LIMITS.premise,
		yourRole: DAYDREAM_LIMITS.yourRole
	};

	const ORIGIN_LIMIT_OF: Record<IdeaOriginField, number> = {
		brief: DAYDREAM_LIMITS.brief,
		research: DAYDREAM_LIMITS.ideaResearch
	};
</script>

{#snippet textField(field: IdeaCoreField)}
	<DaydreamChipField
		{debug}
		label={labels[field].label}
		hint={labels[field].hint}
		value={$form[field]}
		limit={LIMIT_OF[field]}
		chips={IDEA_CHIPS[field]}
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
	class="idea-dialog"
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
					{#each IDEA_TEMPLATES as template (template.id)}
						{const level = $derived(ideaLevel(template.idea.dials))}
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

		{@render textField('premise')}

		<DaydreamFieldList
			{debug}
			fields={$form.fields}
			of="idea"
			kinds={IDEA_FIELD_KINDS}
			{labels}
			chips={IDEA_CHIPS}
			{narrator}
			errors={fieldErrors}
			onchange={(fields) => {
				$form.fields = fields;
			}}
			onMoreIdeas={suggestionsOn ? moreFieldIdeas : undefined}
		/>

		<fieldset class="heat">
			<legend>Heat and kink</legend>
			<p class="hint">How sexual and how kinky it is, from SFW to filthy. Optional: left unset, the daydream follows what you wrote.</p>
			{#each IDEA_SLIDERS as entry (entry.key)}
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

		<fieldset class="parts">
			<legend>Parts for characters</legend>
			<p class="hint">
				Who else the idea needs, like “the interviewer”. Characters are cast into these when you
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
			{@render textField('yourRole')}
			<!-- No chips: these are what was asked for and found, not ideas to pick from. -->
			{#each ORIGIN_FIELDS as field (field)}
				<DaydreamChipField
					label={IDEA_ORIGIN_LABELS[field].label}
					hint={IDEA_ORIGIN_LABELS[field].hint}
					value={$form[field]}
					limit={ORIGIN_LIMIT_OF[field]}
					chips={[]}
					rows={field === 'research' ? 6 : 2}
					onchange={(text) => {
						$form[field] = text;
					}}
				/>
				{#if $errors[field]}<span class="invalid">{$errors[field]}</span>{/if}
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
			<span>Save to my ideas, to use in other daydreams</span>
		</label>
		{#if inLibrary && $form.saveToLibrary}
			<p class="hint">This changes it in your library too.</p>
		{/if}

		{#if problem}<SuggestionProblem {problem} {debug} />{/if}

		<div class="buttons">
			<wa-button appearance="plain" onclick={close}>Cancel</wa-button>
			<wa-button
				type="submit"
				appearance={canSave ? 'filled' : 'outlined'}
				variant={canSave ? 'brand' : 'neutral'}
				disabled={$submitting || thinking}
			>
				{existing ? 'Save changes' : 'Use this idea'}
			</wa-button>
		</div>
	</form>
</wa-dialog>

<style>
	.idea-dialog {
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
