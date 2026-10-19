<script lang="ts">
	import {
		type Answer,
		type AnswerSource,
		DETAIL_KEYS,
		DETAIL_LABELS,
		DETAIL_MAX,
		DETAIL_STEPS,
		type Detail,
		type DetailKey,
		effectiveAnswer,
		isShown,
		LEVEL_LABELS,
		type Level,
		MAX_NOTE_LENGTH,
		type SideKey,
		shownSides
	} from '$lib/kink-list/answers';
	import {
		childrenOf,
		intensityLabel,
		type KinkItem,
		kinkById,
		sidesOf
	} from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import InlineButton from '../InlineButton.svelte';
	import OptionalSlider from '../OptionalSlider.svelte';
	import AnswerScale from './AnswerScale.svelte';
	import KinkRow from './KinkRow.svelte';

	/**
	 * One kink on one line: its name, and a row of answer dots for each of its
	 * contexts — Giving and Receiving, On me and On my partner — or one row for
	 * a kink without a role pair. "Your side" can narrow a role kink to the
	 * context that is yours.
	 *
	 * The name opens the rest under it: the description, where an inherited
	 * answer comes from, Clear, the detailed answer (three sliders per
	 * context), a note, a partner view's controls, and the kink's specifics,
	 * each a row like this one that shows the kink's answer until it has one
	 * of its own.
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
	/** The contexts on screen: both, or only yours when "Your side" is set and the kink leans. */
	const contexts = $derived(shownSides(item, store.filters.side));
	const answer = $derived<Answer | undefined>(store.list.answers[itemKey]);

	const specifics = $derived(item ? childrenOf(item.id) : []);
	const shownSpecifics = $derived(specifics.filter((child) => isShown(child, store.filters)));
	const hiddenSpecifics = $derived(specifics.length - shownSpecifics.length);

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

	function levelFor(side: SideKey | undefined): Level | undefined {
		return side ? answer?.sides?.[side]?.level : answer?.level;
	}

	function detailFor(side: SideKey | undefined): Detail | undefined {
		return side ? answer?.sides?.[side]?.detail : answer?.detail;
	}

	function update(change: (current: Answer | undefined) => Omit<Answer, 'at'>) {
		store.setAnswer(itemKey, change);
	}

	function setLevel(level: Level | undefined, side?: SideKey) {
		update((current) => {
			if (!side) {
				return { ...current, level };
			}
			const sidesNow = current?.sides ?? {};
			return { ...current, sides: { ...sidesNow, [side]: { ...sidesNow[side], level } } };
		});
	}

	function setDetail(key: DetailKey, value: number | null, side?: SideKey) {
		const next = (detail: Detail | undefined): Detail => ({
			...detail,
			[key]: value ?? undefined
		});
		update((current) => {
			if (!side) {
				return { ...current, detail: next(current?.detail) };
			}
			const sidesNow = current?.sides ?? {};
			return {
				...current,
				sides: { ...sidesNow, [side]: { ...sidesNow[side], detail: next(sidesNow[side]?.detail) } }
			};
		});
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

	/** One context, or the whole kink (`undefined`), as the panel lists them. */
	const parts = $derived<(SideKey | undefined)[]>(contexts ?? [undefined]);

	/** What the open panel says of each part's answer: its own, or where an inherited one is from. */
	const summaries = $derived(
		parts.map((side) => ({ side, level: levelFor(side), inherited: inheritedFor(side) }))
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
			<wa-icon class="chevron" name="chevron-right" variant="solid"></wa-icon>
			<span class="text">{name}</span>
			{#if item && item.intensity >= 4}
				<span class="intensity">{intensityLabel(item.intensity)}</span>
			{/if}
			{#if answer?.note}
				<wa-icon class="flag" name="note-sticky" label="Has a note"></wa-icon>
			{/if}
			{#if shownSpecifics.length > 0}
				<span class="flag">+{shownSpecifics.length}<span class="wa-visually-hidden">
						more specific</span
					></span>
			{/if}
			{#if partner?.isOverridden(itemKey)}
				<wa-icon class="flag override" name="user-pen" label="Just for {partner.name}"></wa-icon>
			{/if}
		</button>

		<div class="contexts">
			{#each parts as side (side ?? 'whole')}
				<div class="context">
					{#if side}
						<span class="context-label" aria-hidden="true">{sideLabel(side)}</span>
					{/if}
					<AnswerScale
						label={side ? `${name}, ${sideLabel(side).toLowerCase()}` : name}
						value={levelFor(side)}
						inherited={inheritedFor(side)?.level}
						onchange={(level) => setLevel(level, side)}
					/>
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

			<ul class="answers">
				{#each summaries as { side, level, inherited } (side ?? 'whole')}
					<li>
						{#if side}<span class="context-name">{sideLabel(side)}:</span>{/if}
						{#if level}
							{LEVEL_LABELS[level]}
							<InlineButton onclick={() => setLevel(undefined, side)}>
								Clear <span class="wa-visually-hidden"
									>{side ? `${name}, ${sideLabel(side).toLowerCase()}` : name}</span
								>
							</InlineButton>
						{:else if inherited}
							{LEVEL_LABELS[inherited.level]}, {inherited.from}
						{:else}
							<span class="quiet">Not answered</span>
						{/if}
					</li>
				{/each}
			</ul>

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

			{#each parts as side (side ?? 'whole')}
				<div class="detail">
					{#if side}
						<p class="context-name">{sideLabel(side)}</p>
					{/if}
					{#each DETAIL_KEYS as key (key)}
						<OptionalSlider
							label={DETAIL_LABELS[key]}
							low={DETAIL_STEPS[key][0] ?? ''}
							high={DETAIL_STEPS[key][DETAIL_MAX] ?? ''}
							scale={Object.fromEntries(DETAIL_STEPS[key].map((label, step) => [step, { label }]))}
							min={0}
							max={DETAIL_MAX}
							value={detailFor(side)?.[key] ?? null}
							onchange={(value) => setDetail(key, value, side)}
						/>
					{/each}
				</div>
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

			{#if shownSpecifics.length > 0 || hiddenSpecifics > 0}
				<div class="specifics">
					{#each shownSpecifics as child (child.id)}
						<KinkRow itemKey={child.id} nested />
					{/each}
					{#if hiddenSpecifics > 0}
						<p class="quiet">
							{hiddenSpecifics === 1 ? '1 more is' : `${hiddenSpecifics} more are`} hidden by your filters.
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.kink {
		/* The public list's column centres its text; a list reads from the left. */
		text-align: start;
		border-block-end: var(--wa-border-width-s) solid var(--wa-color-surface-border);

		&.nested:last-of-type {
			border-block-end: 0;
		}
	}

	/* The name takes what the dots leave; on a phone a kink with both contexts
	   puts them under its name, since two rows of dots and a name do not fit. */
	.line {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.125rem 0.5rem;
		padding-block: 0.125rem;

		.two & {
			@media (max-width: 640px) {
				grid-template-columns: minmax(0, 1fr);
			}
		}

		&:hover {
			background: color-mix(in oklab, var(--wa-color-surface-raised) 50%, transparent);
		}
	}

	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-self: start;
		gap: 0.125rem 0.375rem;
		padding: 0.25rem 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;

		.text {
			font-weight: var(--wa-font-weight-semibold);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.chevron {
		font-size: 0.65rem;
		color: var(--wa-color-text-quiet);
		transition: rotate 120ms ease-out;

		[aria-expanded='true'] > & {
			rotate: 90deg;
		}

		@media (prefers-reduced-motion: reduce) {
			transition: none;
		}
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
	.quiet,
	.answers {
		margin: 0;
		font-size: 0.9rem;
		color: var(--wa-color-text-quiet);
	}

	.safety {
		color: var(--wa-color-warning-on-quiet);
	}

	.answers {
		padding: 0;
		list-style: none;

		li {
			margin: 0;
		}
	}

	.context-name {
		margin: 0;
		font-weight: var(--wa-font-weight-semibold);
		color: var(--wa-color-text-normal);
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

	.detail {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.specifics {
		display: flex;
		flex-direction: column;
		padding-inline-start: 0.75rem;
		border-inline-start: var(--wa-border-width-m) solid var(--wa-color-surface-border);
	}
</style>
