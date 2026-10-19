<script lang="ts">
	import {
		type Answer,
		type AnswerSource,
		DETAIL_MAX,
		EXPERIENCE_LABEL,
		EXPERIENCE_STEPS,
		effectiveAnswer,
		INTEREST_KEYS,
		INTEREST_LABELS,
		INTEREST_SHORT_LABELS,
		interestOf,
		isShown,
		isSplit,
		type Level,
		MAX_NOTE_LENGTH,
		type Side,
		type SideKey,
		shownSides,
		withExperience,
		withInterest,
		withLevel
	} from '$lib/kink-list/answers';
	import {
		childrenOf,
		intensityLabel,
		type KinkItem,
		kinkById,
		sidesOf
	} from '$lib/kink-list/catalog';
	import { kinkListContext, kinkListSearch } from '$lib/kink-list/context';
	import OptionalSlider from '../OptionalSlider.svelte';
	import AnswerScale from './AnswerScale.svelte';
	import KinkRow from './KinkRow.svelte';

	/**
	 * One kink on one line: its name, and a row of answer dots for each of its
	 * contexts — Giving and Receiving, On me and On my partner — or one row for
	 * a kink without a role pair. "Answer as" can narrow a role kink to the
	 * context that is yours.
	 *
	 * The name opens the rest under it: the description, the detailed answer
	 * (a fieldset per context: into it as a fantasy, into actually doing it,
	 * and experience), a note and a partner view's controls. Under that, open
	 * or not, come the kink's specifics, each a row like this one that shows
	 * the kink's answer until it has one of its own.
	 *
	 * A context's fantasy and reality are its answer until they differ
	 * (`settleSide` in answers.ts). Once they do, the line shows the two in
	 * place of the one, and goes back to one when they agree again.
	 *
	 * The same row serves a catalogue kink and one the person added
	 * themselves (`custom:…`), and the same answer shows wherever the kink
	 * appears: in its own category, under "related kinks", or in search.
	 */
	let { itemKey, nested = false }: { itemKey: string; nested?: boolean } = $props();

	const { store } = kinkListContext();
	const id = $props.id();

	const item = $derived<KinkItem | undefined>(kinkById(itemKey));
	const custom = $derived(item ? undefined : store.list.custom[itemKey as `custom:${string}`]);
	const name = $derived(item?.name ?? custom?.name ?? '');
	const description = $derived(item?.description ?? custom?.description);
	const sides = $derived(item ? sidesOf(item) : null);
	/** The contexts on screen: both, or only yours when "Answer as" is set and the kink leans. */
	const contexts = $derived(shownSides(item, store.filters.side));
	const answer = $derived<Answer | undefined>(store.list.answers[itemKey]);

	const specifics = $derived(item ? childrenOf(item.id) : []);
	const search = kinkListSearch();
	/** While searching, a specific shows only if it matches, not because its kink does. */
	const shownSpecifics = $derived(
		specifics.filter(
			(child) => isShown(child, store.filters) && (search?.view?.shown.has(child.id) ?? true)
		)
	);
	/** Said only without a search, which counts what the filters hide for the page as a whole. */
	const hiddenSpecifics = $derived(
		search?.view ? 0 : specifics.filter((child) => !isShown(child, store.filters)).length
	);

	let open = $state(false);

	/** Set in a partner's view: whose answer this is, and what to do about it. */
	const partner = $derived(store.partnerControls);

	function sideLabel(side: SideKey): string {
		return sides?.[side === 'a' ? 0 : 1] ?? '';
	}

	function describeSource(source: AnswerSource | undefined): string {
		if (source?.kind === 'parent') {
			return `from ${kinkById(source.itemId)?.name ?? 'the kink above'}`;
		}
		if (source?.kind === 'category') {
			const category = kinkById(source.categoryId)?.name ?? 'this category';
			return `from "${category}": hard limit everything`;
		}
		return '';
	}

	function inheritedFor(side?: SideKey): { level: Level; from: string } | undefined {
		const effective = effectiveAnswer(store.list, itemKey, side);
		if (!effective.level || effective.source?.kind === 'own' || effective.source === undefined) {
			return undefined;
		}
		return { level: effective.level, from: describeSource(effective.source) };
	}

	/** One context's answer, or the whole kink's (`undefined`). */
	function partOf(side: SideKey | undefined): Side | undefined {
		if (side) {
			return answer?.sides?.[side];
		}
		return answer && { level: answer.level, detail: answer.detail };
	}

	function update(change: (current: Answer | undefined) => Omit<Answer, 'at'>) {
		store.setAnswer(itemKey, change);
	}

	function updatePart(side: SideKey | undefined, change: (part: Side | undefined) => Side) {
		update((current) => {
			if (!side) {
				const { level, detail } = change(current && { level: current.level, detail: current.detail });
				return { ...current, level, detail };
			}
			return { ...current, sides: { ...current?.sides, [side]: change(current?.sides?.[side]) } };
		});
	}

	/** A part's accessible name: "Spanking, giving", or the kink's name for a whole kink. */
	function partLabel(side: SideKey | undefined): string {
		return side ? `${name}, ${sideLabel(side).toLowerCase()}` : name;
	}

	type WaTextarea = HTMLElement & { value: string };

	/** Wired by hand: a wa-textarea's input happens in its shadow root (AGENTS.md). */
	function noteField(node: WaTextarea) {
		node.value = answer?.note ?? '';
		const onInput = () => {
			const note = node.value.slice(0, MAX_NOTE_LENGTH);
			update((current) => ({ ...current, note: note === '' ? undefined : note }));
		};
		node.addEventListener('input', onInput);
		return () => node.removeEventListener('input', onInput);
	}

	/** One context, or the whole kink (`undefined`), as the line and the panel list them. */
	const parts = $derived<(SideKey | undefined)[]>(contexts ?? [undefined]);

	/** Each part's answer: one rating, or fantasy and reality apart, and what it inherits. */
	const summaries = $derived(
		parts.map((side) => {
			const part = partOf(side);
			return {
				side,
				level: part?.level,
				split: isSplit(part),
				interest: interestOf(part),
				inherited: inheritedFor(side)
			};
		})
	);

	const experienceScale = Object.fromEntries(
		EXPERIENCE_STEPS.map((label, step) => [step, { label }])
	);
</script>

<div class="kink" class:nested={nested} class:two={contexts?.length === 2}>
	<div class="line">
		<!-- A disclosure: a native button, because wa-button would not carry aria-expanded. -->
		<button
			type="button"
			class="name"
			aria-expanded={open}
			aria-controls="{id}-panel"
			onclick={() => {
				open = !open;
			}}
		>
			<span class="chevron-line"
				><wa-icon class="chevron" name="chevron-right" variant="solid"></wa-icon></span
			>
			<!-- The name and its flags wrap beside the chevron, never under it. -->
			<span class="label">
				<span class="text">{name}</span>
				{#if item && item.intensity >= 4}
					<span class="intensity">{intensityLabel(item.intensity)}</span>
				{/if}
				{#if answer?.note}
					<wa-icon class="flag" name="note-sticky" label="Has a note"></wa-icon>
				{/if}
				{#if partner?.isOverridden(itemKey)}
					<wa-icon class="flag override" name="user-pen" label="Just for {partner.name}"></wa-icon>
				{/if}
			</span>
		</button>

		<div class="contexts">
			{#each summaries as { side, level, split, interest, inherited } (side ?? 'whole')}
				<div class="context">
					{#if side}
						<span class="context-label" aria-hidden="true">{sideLabel(side)}</span>
					{/if}
					{#if split}
						<!-- Fantasy and reality have parted: the two in place of the one. -->
						<div class="split">
							{#each INTEREST_KEYS as key (key)}
								<span class="interest-label" aria-hidden="true">{INTEREST_SHORT_LABELS[key]}</span>
								<AnswerScale
									label="{partLabel(side)}, {INTEREST_SHORT_LABELS[key].toLowerCase()}"
									value={interest[key]}
									onchange={(next) => updatePart(side, (part) => withInterest(part, key, next))}
								/>
							{/each}
						</div>
					{:else}
						<AnswerScale
							label={partLabel(side)}
							value={level}
							inherited={inherited?.level}
							inheritedFrom={inherited?.from}
							onchange={(next) => updatePart(side, (part) => withLevel(part, next))}
						/>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	{#if open}
		<div class="panel" id="{id}-panel">
			{#if description}
				<p class="description">{description}</p>
			{/if}
			{#if item?.safety}
				<p class="safety">{item.safety}</p>
			{/if}

			{#if partner && (partner.isOverridden(itemKey) || partner.hasOwn(itemKey) || partner.isHeld(itemKey))}
				<p class="partner">
					{#if partner.isOverridden(itemKey)}
						<span class="badge">Just for {partner.name}</span>
						<button type="button" class="link" onclick={() => partner?.reset(itemKey)}>
							Back to my own answer<span class="wa-visually-hidden">for {name}</span>
						</button>
						<button type="button" class="link" onclick={() => partner?.copyToOwn(itemKey)}>
							Copy to my own list<span class="wa-visually-hidden">: {name}</span>
						</button>
					{:else if partner.hasOwn(itemKey)}
						<span class="quiet">From your own list</span>
					{/if}
					{#if partner.isHeld(itemKey)}
						<span class="badge held">Hidden from {partner.name}</span>
					{/if}
				</p>
			{/if}

			{#each summaries as { side, split, interest, inherited } (side ?? 'whole')}
				<!-- A fieldset per context, named by it. A kink without contexts has
				     one set, which its name already covers. -->
				<svelte:element this={side ? 'fieldset' : 'div'} class="part" class:framed={side}>
					{#if side}
						<legend>{sideLabel(side)}</legend>
					{/if}
					{#each INTEREST_KEYS as key (key)}
						<div class="interest">
							<span class="interest-title" aria-hidden="true">{INTEREST_LABELS[key]}</span>
							<AnswerScale
								label="{partLabel(side)}, {INTEREST_LABELS[key].toLowerCase()}"
								value={interest[key]}
								inherited={split ? undefined : inherited?.level}
								inheritedFrom={inherited?.from}
								onchange={(next) => updatePart(side, (part) => withInterest(part, key, next))}
							/>
						</div>
					{/each}
					<!-- Titled on the left like the two above, its slider where their dots are. -->
					<div class="interest">
						<span class="interest-title" aria-hidden="true">{EXPERIENCE_LABEL}</span>
						<div class="experience">
							<OptionalSlider
								label={EXPERIENCE_LABEL}
								titleHidden
								low={EXPERIENCE_STEPS[0]}
								high={EXPERIENCE_STEPS[DETAIL_MAX]}
								scale={experienceScale}
								min={0}
								max={DETAIL_MAX}
								value={partOf(side)?.detail?.experience ?? null}
								onchange={(value) =>
									updatePart(side, (part) => withExperience(part, value ?? undefined))}
							/>
						</div>
					</div>
				</svelte:element>
			{/each}

			<wa-textarea
				label="Notes or conditions"
				hint="Anything you want to say about this, like when or how."
				rows={2}
				resize="auto"
				maxlength={MAX_NOTE_LENGTH}
				{@attach noteField}
			></wa-textarea>

			{#if partner}
				<label class="hold">
					<input
						type="checkbox"
						checked={partner.isHeld(itemKey)}
						onchange={(event) => partner?.setHeld(itemKey, event.currentTarget.checked)}
					/>
					Don't show {partner.name} this yet
				</label>
			{/if}

			{#if item?.aliases?.length}
				<p class="aliases">Also called: {item.aliases.join(', ')}</p>
			{/if}

		</div>
	{/if}

	<!-- Always shown, under the kink rather than inside its panel: a specific
	     is a kink to answer like any other, and hiding it behind a tap left
	     most of them unseen. -->
	{#if shownSpecifics.length > 0 || hiddenSpecifics > 0}
		<div class="specifics">
			{#each shownSpecifics as child (child.id)}
				<KinkRow itemKey={child.id} nested />
			{/each}
			{#if hiddenSpecifics > 0}
				<p class="quiet">
					{hiddenSpecifics === 1 ? '1 more is' : `${hiddenSpecifics} more are`} hidden by your level of detail.
				</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.kink {
		/* The public list's column centres its text; a list reads from the left. */
		text-align: start;
		border-block-end: var(--wa-border-width-s) solid var(--wa-color-surface-border);

		/* A line between rows, not under the last: the category's or kink's
		   own edge closes the list. */
		&:last-child {
			border-block-end: 0;
		}
	}

	/* The name takes what the dots leave; on a phone a kink with both contexts
	   puts them under its name, since two rows of dots and a name do not fit. */
	/* The name, then the dots at the far end — on the same line when the whole
	   name fits beside them, and on the next when it does not, rather than the
	   name squeezed into a column of a word a line, or running under them. */
	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.125rem 0.5rem;
		padding-block: 0.125rem;

		&:hover {
			background: color-mix(in oklab, var(--wa-color-surface-raised) 50%, transparent);
		}
	}

	/* The chevron on the name's first line, and a name too long for the line
	   wrapping beside it, never under it. */
	.name {
		display: flex;
		align-items: flex-start;
		gap: 0.375rem;
		min-inline-size: 0;
		/* Web Awesome's native styles give a <button> a form control's height,
		   which left the name sitting high beside the dots. */
		min-block-size: 0;
		block-size: auto;
		padding: 0.25rem 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;

		.label {
			min-inline-size: 0;
			overflow-wrap: anywhere;
		}

		.text {
			font-weight: var(--wa-font-weight-semibold);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	/* One line tall, so the chevron is centred on the name's first line however
	   many it wraps onto. */
	.chevron-line {
		flex: none;
		display: flex;
		align-items: center;
		block-size: 1lh;
	}

	.chevron {
		font-size: 0.65rem;
		color: var(--wa-color-text-quiet);
		transition: rotate 120ms ease-out;

		[aria-expanded='true'] > .chevron-line > & {
			rotate: 90deg;
		}

		@media (prefers-reduced-motion: reduce) {
			transition: none;
		}
	}

	/* Inline, after the name, so they wrap with it. */
	.intensity,
	.flag {
		margin-inline-start: 0.375rem;
		white-space: nowrap;
	}

	.intensity {
		font-size: 0.75rem;
		color: var(--wa-color-warning-on-quiet);
	}

	.flag {
		font-size: 0.75rem;
		color: var(--wa-color-text-quiet);

		&.override {
			color: var(--wa-color-brand-on-quiet);
		}
	}

	.contexts {
		margin-inline-start: auto;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0 1rem;

		.two & {
			@media (max-width: 640px) {
				flex-direction: column;
				align-items: flex-end;
			}
		}
	}

	.context {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	/* Fantasy over reality, each named beside its dots. */
	.split {
		display: grid;
		grid-template-columns: auto auto;
		align-items: center;
		gap: 0 0.375rem;
	}

	.interest-label {
		font-size: 0.7rem;
		color: var(--wa-color-text-quiet);
		text-align: end;
	}

	.context-label {
		font-size: 0.75rem;
		color: var(--wa-color-text-quiet);
		text-align: end;
		white-space: nowrap;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.25rem 0 0.75rem 1rem;
	}

	.description,
	.safety,
	.aliases,
	.quiet {
		margin: 0;
		font-size: 0.9rem;
		color: var(--wa-color-text-quiet);
	}

	.safety {
		color: var(--wa-color-warning-on-quiet);
	}

	.partner {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		margin: 0;
		font-size: 0.85rem;
	}

	.badge {
		padding: 0.05rem 0.5rem;
		border-radius: var(--wa-border-radius-pill);
		background: var(--wa-color-brand-fill-quiet);
		color: var(--wa-color-brand-on-quiet);

		&.held {
			background: var(--wa-color-warning-fill-quiet);
			color: var(--wa-color-warning-on-quiet);
		}
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--wa-color-brand-on-quiet);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.hold {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.part {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-inline-size: 0;

		&.framed {
			margin: 0;
			padding: 0.5rem 0.75rem 0.75rem;
			border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-m);
		}

		legend {
			padding-inline: 0.25rem;
			font-weight: var(--wa-font-weight-semibold);
		}
	}

	/* The title, then its dots at the far end, or under it when they do not fit. */
	.interest {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem 0.75rem;
	}

	/* As wide as a row of dots (`AnswerScale`), so it lines up under them. */
	.experience {
		inline-size: 11.75rem;
		max-inline-size: 100%;
	}

	.interest-title {
		font-weight: var(--wa-form-control-label-font-weight);
		color: var(--wa-form-control-label-color);
	}

	.specifics {
		display: flex;
		flex-direction: column;
		padding-inline-start: 1.25rem;
		/* The hairline over the first specific, where the kink's own would be
		   if the specifics were not part of its row; each specific has its own
		   under it, but the last, which the kink's closes. Indented with them. */
		background:
			linear-gradient(var(--wa-color-surface-border), var(--wa-color-surface-border)) 1.25rem 0 /
			calc(100% - 1.25rem) var(--wa-border-width-s) no-repeat;
	}
</style>
