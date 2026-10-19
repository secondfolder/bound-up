<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import {
		type Answer,
		type ItemKey,
		LEVEL_LABELS,
		LEVELS,
		type Level,
		MAX_NOTE_LENGTH,
		type SideKey
	} from '$lib/kink-list/answers';
	import { intensityLabel, kinkById, primaryCategoryOf, sidesOf } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import { deckCards, narrows } from '$lib/kink-list/deck';

	/**
	 * Quick fill, step two: one card per kink.
	 *
	 * Every answer is a button under the card, always, so the deck works
	 * without gestures, by keyboard (1–7, the arrows, Backspace, S) and with a
	 * screen reader. Swiping is a shortcut on top: right for Like, left for Not
	 * for me, up for Love, down for Hard limit.
	 *
	 * The deck is worked out from the list (`deckCards`), so answering a card
	 * is what moves it on, and undoing an answer brings its card back. The one
	 * thing held here is a Conditional card, kept on screen while its note is
	 * written.
	 */
	let { ondone }: { ondone: () => void } = $props();

	const { store } = kinkListContext();

	const cards = $derived(deckCards(store.list));
	/** A card answered Conditional, held while its note is written. */
	let holding = $state<ItemKey | null>(null);
	const current = $derived(holding ?? cards[0] ?? null);

	const item = $derived(current ? kinkById(current) : undefined);
	const custom = $derived(
		current && !item ? store.list.custom[current as `custom:${string}`] : undefined
	);
	const name = $derived(item?.name ?? custom?.name ?? '');
	const description = $derived(item?.description ?? custom?.description);
	const sides = $derived(item ? sidesOf(item) : null);
	const category = $derived.by(() => {
		if (item) {
			return primaryCategoryOf(item);
		}
		return custom ? kinkById(custom.categoryId) : undefined;
	});
	const broader = $derived(current ? narrows(current) : undefined);

	/** Which side the next answer is for: both, unless one is picked on this card. */
	let side: SideKey | 'both' = $state('both');
	let lastCard: ItemKey | null = null;
	$effect.pre(() => {
		if (current !== lastCard) {
			lastCard = current;
			side = 'both';
		}
	});

	/** Answered this session, newest last, with what each was before: what Undo puts back. */
	let history: { key: ItemKey; before: Answer | undefined; wasSkipped: boolean }[] = $state([]);
	const done = $derived(history.length);

	$effect(() => {
		if (current === null) {
			ondone();
		}
	});

	function remember(key: ItemKey) {
		history.push({
			key,
			before: store.list.answers[key],
			wasSkipped: store.list.skipped[key]?.skipped === true
		});
	}

	function answer(level: Level) {
		// A card on its way out after a swipe has been answered already; a tap
		// in those few milliseconds would land on it rather than the next one.
		if (!current || leaving) {
			return;
		}
		const key = current;
		if (holding !== key) {
			remember(key);
		}
		store.setAnswer(key, (existing) => {
			if (side === 'both') {
				return { ...existing, level };
			}
			const sidesNow = existing?.sides ?? {};
			return { ...existing, sides: { ...sidesNow, [side]: { ...sidesNow[side], level } } };
		});
		holding = level === 'conditional' ? key : null;
	}

	function skip() {
		if (!current || leaving) {
			return;
		}
		if (holding === current) {
			holding = null;
			return;
		}
		remember(current);
		store.setSkipped(current, true);
	}

	function undo() {
		const last = history.pop();
		if (!last) {
			return;
		}
		holding = null;
		store.setAnswer(last.key, () => {
			const { at: _at, ...rest } = last.before ?? { at: 0 };
			return rest;
		});
		if (store.list.skipped[last.key]?.skipped !== last.wasSkipped) {
			store.setSkipped(last.key, last.wasSkipped);
		}
	}

	type WaTextarea = HTMLElement & { value: string | null };

	/** The note on a Conditional card. Wired by hand: input happens in the shadow root (AGENTS.md). */
	function conditionField(node: WaTextarea) {
		node.value = holding ? (store.list.answers[holding]?.note ?? '') : '';
		const onInput = () => {
			const key = holding;
			if (!key) {
				return;
			}
			const note = (node.value ?? '').slice(0, MAX_NOTE_LENGTH);
			store.setAnswer(key, (existing) => ({ ...existing, note: note === '' ? undefined : note }));
		};
		node.addEventListener('input', onInput);
		queueMicrotask(() => node.focus());
		return () => node.removeEventListener('input', onInput);
	}

	// ── swiping ──────────────────────────────────────────────────────────────

	const SWIPE_DISTANCE = 80;
	/** How long a swiped card takes to fly off, matching the transition below. */
	const LEAVE_MS = 180;
	const SWIPES: Record<'right' | 'left' | 'up' | 'down', Level> = {
		right: 'like',
		left: 'not-for-me',
		up: 'love',
		down: 'limit'
	};

	let drag = $state<{ x: number; y: number } | null>(null);
	let leaving = $state<{ x: number; y: number } | null>(null);

	function direction(x: number, y: number): keyof typeof SWIPES | null {
		if (Math.max(Math.abs(x), Math.abs(y)) < SWIPE_DISTANCE) {
			return null;
		}
		if (Math.abs(x) >= Math.abs(y)) {
			return x > 0 ? 'right' : 'left';
		}
		return y < 0 ? 'up' : 'down';
	}

	const pending = $derived(drag ? direction(drag.x, drag.y) : null);

	function swipeable(node: HTMLElement) {
		let start: { x: number; y: number; id: number } | null = null;
		const down = (event: PointerEvent) => {
			// Buttons, fields and the side picker keep their own clicks.
			if (holding || (event.target as Element).closest('button, wa-button, wa-textarea, label')) {
				return;
			}
			start = { x: event.clientX, y: event.clientY, id: event.pointerId };
			node.setPointerCapture(event.pointerId);
		};
		const move = (event: PointerEvent) => {
			if (start?.id === event.pointerId) {
				drag = { x: event.clientX - start.x, y: event.clientY - start.y };
			}
		};
		const up = (event: PointerEvent) => {
			if (start?.id !== event.pointerId) {
				return;
			}
			start = null;
			const ended = drag;
			drag = null;
			const way = ended ? direction(ended.x, ended.y) : null;
			if (!(ended && way)) {
				return;
			}
			if (prefersReducedMotion.current) {
				answer(SWIPES[way]);
				return;
			}
			leaving = { x: ended.x * 4, y: ended.y * 4 };
			setTimeout(() => {
				leaving = null;
				answer(SWIPES[way]);
			}, LEAVE_MS);
		};
		const cancel = () => {
			start = null;
			drag = null;
		};
		node.addEventListener('pointerdown', down);
		node.addEventListener('pointermove', move);
		node.addEventListener('pointerup', up);
		node.addEventListener('pointercancel', cancel);
		return () => {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
		};
	}

	const offset = $derived(leaving ?? drag);
	const cardStyle = $derived.by(() => {
		if (!offset) {
			return '';
		}
		const move = `transform: translate(${offset.x}px, ${offset.y}px) rotate(${offset.x / 20}deg);`;
		return leaving
			? `${move} transition: transform ${LEAVE_MS}ms ease-in, opacity ${LEAVE_MS}ms ease-in; opacity: 0;`
			: move;
	});

	// ── keys ─────────────────────────────────────────────────────────────────

	/** The number keys answer, 1 for Hard limit to 7 for Love, as the buttons show. */
	const LEVEL_KEY = /^[1-7]$/;

	const ARROWS: Record<string, keyof typeof SWIPES> = {
		ArrowRight: 'right',
		ArrowLeft: 'left',
		ArrowUp: 'up',
		ArrowDown: 'down'
	};

	function onKey(event: KeyboardEvent) {
		const target = event.target as Element | null;
		if (
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			target?.closest('input, textarea, wa-textarea, wa-input, select, wa-select')
		) {
			return;
		}
		const index = Number(event.key) - 1;
		const level = LEVELS[index];
		if (level && LEVEL_KEY.test(event.key)) {
			answer(level);
		} else if (event.key in ARROWS) {
			answer(SWIPES[ARROWS[event.key] as keyof typeof SWIPES]);
		} else if (event.key === 'Backspace') {
			undo();
		} else if (event.key === 's' || event.key === 'S') {
			skip();
		} else {
			return;
		}
		event.preventDefault();
	}

	const sideChoices = $derived<{ value: SideKey | 'both'; label: string }[]>(
		sides
			? [
					{ value: 'both', label: 'Both' },
					{ value: 'a', label: sides[0] },
					{ value: 'b', label: sides[1] }
				]
			: []
	);

	const VARIANTS: Partial<Record<Level, 'danger' | 'success'>> = {
		limit: 'danger',
		'not-for-me': 'danger',
		like: 'success',
		love: 'success'
	};
</script>

<svelte:window onkeydown={onKey} />

{#if current}
	<div class="deck">
		<p class="progress" aria-live="polite">
			{done} answered · {cards.length} to go
		</p>

		<article class="card" class:dragging={drag !== null} style={cardStyle} {@attach swipeable}>
			{#if pending}
				<span class="hint {pending}" aria-hidden="true">{LEVEL_LABELS[SWIPES[pending]]}</span>
			{/if}
			<p class="where">
				{category?.name ?? ''}{#if item && item.intensity >= 4}
					· {intensityLabel(item.intensity)}{/if}
			</p>
			{#if broader}
				<p class="where">Specifically, for {broader.name}:</p>
			{/if}
			<h2>{name}</h2>
			{#if description}
				<p class="description">{description}</p>
			{/if}
			{#if item?.safety}
				<p class="safety">{item.safety}</p>
			{/if}

			{#if sideChoices.length > 0 && holding === null}
				<fieldset class="sides">
					<legend>Answering for</legend>
					{#each sideChoices as choice (choice.value)}
						<label class="side">
							<input type="radio" name="deck-side" value={choice.value} bind:group={side} />
							<span>{choice.label}</span>
						</label>
					{/each}
				</fieldset>
			{/if}

			{#if holding}
				<wa-textarea
					label="What's the condition?"
					hint="Saved as you type. Next when you're done."
					rows={2}
					maxlength={MAX_NOTE_LENGTH}
					{@attach conditionField}
				></wa-textarea>
			{/if}
		</article>

		{#if holding}
			<div class="actions">
				<wa-button variant="brand" appearance="accent" onclick={() => {
						holding = null;
					}}>Next</wa-button
				>
			</div>
		{:else}
			<div class="answers">
				{#each LEVELS as level, index (level)}
					<wa-button
						size="s"
						variant={VARIANTS[level] ?? 'neutral'}
						appearance="outlined"
						onclick={() => answer(level)}
					>
						{LEVEL_LABELS[level]}<span class="key" aria-hidden="true">{index + 1}</span>
					</wa-button>
				{/each}
			</div>
			<div class="actions">
				<wa-button size="s" appearance="plain" onclick={skip}>Skip</wa-button>
				<wa-button size="s" appearance="plain" disabled={history.length === 0} onclick={undo}>
					Undo
				</wa-button>
			</div>
			<p class="swipe-help">Swipe right for Like, left for Not for me, up for Love, down for Hard limit.</p>
		{/if}
	</div>
{/if}

<style>
	.deck {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-inline-size: 32rem;
		margin-inline: auto;
	}

	.progress,
	.swipe-help {
		margin: 0;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);
	}

	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-block-size: 16rem;
		padding: 1.25rem;
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-default);
		box-shadow: var(--wa-shadow-m);
		touch-action: none;
		user-select: none;

		&.dragging {
			cursor: grabbing;
		}

		h2 {
			margin: 0;
		}
	}

	.where,
	.description,
	.safety {
		margin: 0;
	}

	.where {
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);
	}

	.safety {
		color: var(--wa-color-warning-on-quiet);
	}

	.hint {
		position: absolute;
		inset-block-start: 0.75rem;
		inset-inline-end: 0.75rem;
		padding: 0.2rem 0.6rem;
		border-radius: var(--wa-border-radius-pill);
		font-weight: var(--wa-font-weight-bold);
		background: var(--wa-color-brand-fill-loud);
		color: var(--wa-color-brand-on-loud);

		&.left,
		&.down {
			background: var(--wa-color-danger-fill-loud);
			color: var(--wa-color-danger-on-loud);
		}

		&.right,
		&.up {
			background: var(--wa-color-success-fill-loud);
			color: var(--wa-color-success-on-loud);
		}
	}

	.sides {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin: 0.5rem 0 0;
		padding: 0;
		border: 0;

		legend {
			padding: 0;
			margin-block-end: 0.25rem;
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}
	}

	.side {
		position: relative;

		input {
			position: absolute;
			opacity: 0;
			inset: 0;
			margin: 0;
		}

		span {
			display: inline-block;
			padding: 0.25rem 0.65rem;
			border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-pill);
			font-size: 0.875rem;
		}

		input:checked + span {
			background: var(--wa-color-brand-fill-loud);
			border-color: var(--wa-color-brand-fill-loud);
			color: var(--wa-color-brand-on-loud);
		}

		input:focus-visible + span {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.answers {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
		gap: 0.375rem;

		.key {
			margin-inline-start: 0.4em;
			font-size: 0.75em;
			opacity: 0.6;
		}
	}

	.actions {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
	}
</style>
