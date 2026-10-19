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
		type Level,
		MAX_NOTE_LENGTH,
		type SideKey
	} from '$lib/kink-list/answers';
	import {
		childrenOf,
		intensityLabel,
		type KinkItem,
		kinkById,
		sidesOf
	} from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import OptionalSlider from '../OptionalSlider.svelte';
	import AnswerScale from './AnswerScale.svelte';
	import KinkRow from './KinkRow.svelte';

	/**
	 * One kink and its answer: the scale, and behind "More" the detailed
	 * answer (three sliders), a note, and — for a kink with a role pair — the
	 * choice of answering each side on its own. A kink's specifics sit under
	 * it, each showing the kink's answer until it has one of its own.
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
	const answer = $derived<Answer | undefined>(store.list.answers[itemKey]);
	const split = $derived(sides !== null && answer?.sides !== undefined);

	const specifics = $derived(item ? childrenOf(item.id) : []);
	const shownSpecifics = $derived(
		specifics.filter((child) => child.intensity <= store.list.settings.maxIntensity)
	);
	const hiddenSpecifics = $derived(specifics.length - shownSpecifics.length);

	let showMore = $state(false);
	let showSpecifics = $state(false);

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

	/**
	 * Answering each side separately starts both from the answer as it was,
	 * and going back keeps the first side's: nothing is thrown away without
	 * the person seeing it on screen first.
	 */
	function setSplit(on: boolean) {
		update((current) => {
			if (on) {
				const both = { level: current?.level, detail: current?.detail };
				return { ...current, level: undefined, detail: undefined, sides: { a: both, b: both } };
			}
			const first = current?.sides?.a ?? current?.sides?.b;
			return { ...current, level: first?.level, detail: first?.detail, sides: undefined };
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

	const sideKeys: SideKey[] = ['a', 'b'];

	function detailFor(side: SideKey | undefined): Detail | undefined {
		return side ? answer?.sides?.[side]?.detail : answer?.detail;
	}
</script>

<article class="kink" class:nested aria-labelledby="{id}-name">
	<header>
		<svelte:element this={nested ? 'h3' : 'h2'} id="{id}-name" class="name">{name}</svelte:element>
		{#if item && item.intensity >= 4}
			<span class="intensity">{intensityLabel(item.intensity)}</span>
		{/if}
	</header>
	{#if description}
		<p class="description">{description}</p>
	{/if}
	{#if item?.safety}
		<p class="safety">{item.safety}</p>
	{/if}

	{#if split && sides}
		<div class="sides">
			{#each sideKeys as side, index (side)}
				<div class="side">
					<span class="side-label" aria-hidden="true">{sides[index]}</span>
					<AnswerScale
						label="{name}, {sides[index]?.toLowerCase()}"
						value={answer?.sides?.[side]?.level}
						inherited={inheritedFor(side)}
						onchange={(level) => setLevel(level, side)}
					/>
				</div>
			{/each}
		</div>
	{:else}
		<AnswerScale
			label={name}
			value={answer?.level}
			inherited={inheritedFor()}
			onchange={(level) => setLevel(level)}
		/>
	{/if}

	{#if answer?.note && !showMore}
		<p class="note-preview">{answer.note}</p>
	{/if}

	<div class="toggles">
		<!-- A disclosure: a native button, because wa-button would not carry aria-expanded. -->
		<button
			type="button"
			class="toggle"
			aria-expanded={showMore}
			aria-controls="{id}-more"
			onclick={() => {
					showMore = !showMore;
				}}
		>
			{showMore ? 'Less' : 'More detail and notes'}<span class="wa-visually-hidden">for {name}</span>
		</button>
		{#if shownSpecifics.length > 0}
			<button
				type="button"
				class="toggle"
				aria-expanded={showSpecifics}
				aria-controls="{id}-specifics"
				onclick={() => {
					showSpecifics = !showSpecifics;
				}}
			>
				{showSpecifics ? 'Hide specifics' : `Get specific (${shownSpecifics.length})`}<span
					class="wa-visually-hidden">for {name}</span
				>
			</button>
		{/if}
	</div>

	{#if showMore}
		<div class="more" id="{id}-more">
			{#if sides}
				<wa-switch
					checked={split}
					{@attach (node: HTMLElement & { checked: boolean }) => {
						const onChange = () => setSplit(node.checked);
						node.addEventListener('change', onChange);
						return () => node.removeEventListener('change', onChange);
					}}
				>
					Answer {sides[0].toLowerCase()} and {sides[1].toLowerCase()} separately
				</wa-switch>
			{/if}

			{#each split && sides ? sideKeys : [undefined] as side (side ?? 'both')}
				<div class="detail">
					{#if side && sides}
						<p class="side-label">{sides[side === 'a' ? 0 : 1]}</p>
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

			{#if item?.aliases?.length}
				<p class="aliases">Also called: {item.aliases.join(', ')}</p>
			{/if}
		</div>
	{/if}

	{#if showSpecifics}
		<div class="specifics" id="{id}-specifics">
			{#each shownSpecifics as child (child.id)}
				<KinkRow itemKey={child.id} nested />
			{/each}
			{#if hiddenSpecifics > 0}
				<p class="hidden-note">
					{hiddenSpecifics === 1 ? '1 more is' : `${hiddenSpecifics} more are`} above your intensity setting.
				</p>
			{/if}
		</div>
	{/if}
</article>

<style>
	.kink {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-default);

		&.nested {
			padding: 0.75rem 0 0;
			border: 0;
			border-block-start: var(--wa-border-width-s) solid var(--wa-color-surface-border);
			border-radius: 0;
			background: none;
		}
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;

		.name {
			margin: 0;
			font-size: 1.05rem;
		}
	}

	.intensity {
		font-size: 0.75rem;
		color: var(--wa-color-warning-on-quiet);
	}

	.description,
	.safety,
	.note-preview,
	.aliases,
	.hidden-note {
		margin: 0;
		font-size: 0.9rem;
		color: var(--wa-color-text-quiet);
	}

	.safety {
		color: var(--wa-color-warning-on-quiet);
	}

	.note-preview {
		font-style: italic;
		white-space: pre-wrap;
	}

	.sides {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.side-label {
		display: block;
		margin: 0 0 0.25rem;
		font-size: 0.85rem;
		font-weight: var(--wa-font-weight-semibold);
	}

	.toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}

	.toggle {
		padding: 0;
		border: 0;
		background: none;
		color: var(--wa-color-brand-on-quiet);
		font: inherit;
		font-size: 0.875rem;
		text-decoration: underline;
		cursor: pointer;
	}

	.more {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.detail {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.specifics {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-inline-start: 0.75rem;
		border-inline-start: var(--wa-border-width-m) solid var(--wa-color-surface-border);
	}
</style>
