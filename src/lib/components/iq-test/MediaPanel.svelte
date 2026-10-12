<script lang="ts">
	import { type Snippet, untrack } from 'svelte';
	import { type Clip, type Origin, originKey } from '$lib/playroom/iq-test/media';
	import { fitCount } from '$lib/playroom/iq-test/media-fit';
	import { trackImage } from '$lib/playroom/iq-test/media-image';
	import ClipPlayer from './ClipPlayer.svelte';
	import ClipScrubber from './ClipScrubber.svelte';
	import EnlargeableItem from './EnlargeableItem.svelte';

	/**
	 * A column of porn beside the test, from intensity 3. Pictures rotate
	 * slowly, each on its own clock, which stands still while it is pointed
	 * at and starts again when it is changed by hand; a clip sits on top when
	 * the feed has one, and changes when it ends. The first column can lead
	 * with the hypno's video too (`lead`), as one more of its videos.
	 *
	 * It fills its box exactly, whatever the window: a column on a wide
	 * window as tall as the window, a strip on a narrow one as wide. As many
	 * items as come nearest to filling it are shown, each at its own shape,
	 * and all scaled by one small factor to fit, cropping a little rather than
	 * leaving a gap or running off the edge (see `media-fit.ts`). Shapes are
	 * learnt as each picture or video loads, a guess until then.
	 *
	 * Each item can be clicked to see it bigger, in place (`EnlargeableItem`):
	 * the same element, so a clip carries on from where it was. While one is
	 * enlarged the column holds still — no picture rotates away, no clip moves
	 * on underneath it, nothing is added or dropped — and catches up once it
	 * is closed.
	 */
	let {
		images,
		clips,
		origins = {},
		offset,
		stride = 2,
		orientation = 'column',
		gap = 8,
		audible = false,
		lead,
		leadOrigin = null,
		onenlarge
	}: {
		images: readonly string[];
		clips: readonly Clip[];
		/** Where each was posted, by `originKey`: linked over its buttons. */
		origins?: Readonly<Record<string, Origin>>;
		/** Where in the feed this column starts, so columns differ. */
		offset: number;
		/**
		 * How many columns share the feed. Each takes every `stride`th clip from
		 * its offset, so no two ever play the same one.
		 */
		stride?: number;
		/** A column, filled top to bottom, or a strip, filled side to side. */
		orientation?: 'column' | 'row';
		/** The space between items, in pixels: wider at intensity 3 than 4. */
		gap?: number;
		/**
		 * Whether this column's clip may be heard. Only one column's is: two
		 * soundtracks at once are just noise.
		 */
		audible?: boolean;
		/** A video shown first, above the porn: the hypno, in the first column. */
		lead?: Snippet;
		/** The hypno's title and page, over its buttons as each picture's are. */
		leadOrigin?: Origin | null;
		/** The clip was enlarged or put back, so the page can let it be the one heard. */
		onenlarge?: (clipOpen: boolean) => void;
	} = $props();

	/** How long a picture is up before it moves on, counted only while it can be seen and is not pointed at. */
	const ROTATE_MS = 7000;
	/** How often each picture's clock is advanced. */
	const TICK_MS = 250;
	/** The most pictures a column or strip ever holds: far more than fit. */
	const MOST_PICTURES = 12;
	/** How far back each item's "back" button can go. */
	const HISTORY = 20;
	/** Shapes, width over height, guessed until learnt: portrait pictures and clips, a wide PMV. */
	const GUESSED = { lead: 16 / 9, clip: 9 / 16, picture: 3 / 4 } as const;

	/**
	 * One place in the column: the clip's, or a picture's. Each keeps what it
	 * has shown, so it can go back, and can be locked, which keeps it out of
	 * the rotation, "New porn", and moving on when its clip ends.
	 *
	 * A picture changes in two steps: `history[at]` is the one wanted, and
	 * `shown` the one on screen, which becomes the wanted one only once it has
	 * loaded — until then the old stays, with a loading bar along its foot.
	 * A clip does the same inside `ClipPlayer`, which reports it as `loading`.
	 */
	type Slot = {
		id: number;
		kind: 'picture' | 'clip';
		/** Picture URLs, or clip ids. */
		history: string[];
		at: number;
		shown: string;
		locked: boolean;
		loading: boolean;
		/** Pictures in a row that would not load: past a few, it stops trying others. */
		failures: number;
	};

	let slots = $state<Slot[]>([]);
	let nextSlotId = 0;
	/** Where in the feed the next picture and clip are drawn from: every `stride`th from `offset`. */
	let pictureCursor = 0;
	let clipCursor = 0;
	/** How many of this column's items are enlarged: while any is, it holds still. */
	let enlarged = $state(0);
	/** Slots due to move on once nothing is enlarged: a clip ended, or the feed changed. */
	const due = new Set<number>();

	/**
	 * Clips the page can play itself come first; one known only from a reddit
	 * link has no file and plays in Redgifs' player, out of the volume's reach.
	 * Those are used only when there is nothing better.
	 */
	const playable = $derived.by(() => {
		const withFiles = clips.filter((candidate) => candidate.video !== null);
		return withFiles.length > 0 ? withFiles : clips;
	});
	const clipsById = $derived(new Map(playable.map((candidate) => [candidate.id, candidate])));

	const wanted = (slot: Slot) => slot.history[slot.at] ?? '';

	/** What every other place has on screen or on its way, so no two show the same. */
	function inUse(except: Slot | null): Set<string> {
		const keys = new Set<string>();
		for (const slot of slots) {
			if (slot !== except) {
				keys.add(slot.shown);
				keys.add(wanted(slot));
			}
		}
		return keys;
	}

	/** The next picture or clip from this column's share of the feed that is not already up. */
	function draw(kind: Slot['kind'], except: Slot | null): string | null {
		const used = inUse(except);
		const own = except ? wanted(except) : null;
		const pool = kind === 'picture' ? images : playable.map((candidate) => candidate.id);
		for (const _ of pool) {
			const cursor = kind === 'picture' ? pictureCursor : clipCursor;
			if (kind === 'picture') {
				pictureCursor += 1;
			} else {
				clipCursor += 1;
			}
			const key = pool[(offset + cursor * stride) % pool.length] ?? '';
			if (!used.has(key) && key !== own) {
				return key;
			}
		}
		return null;
	}

	function newSlot(kind: Slot['kind']): Slot | null {
		const key = draw(kind, null);
		if (key === null) {
			return null;
		}
		nextSlotId += 1;
		return {
			id: nextSlotId,
			kind,
			history: [key],
			at: 0,
			// A clip's own player does the swapping; a picture has none until it loads.
			shown: kind === 'clip' ? key : '',
			locked: false,
			loading: false,
			failures: 0
		};
	}

	/** On to something new: forward through its history if it went back, else a fresh draw. */
	function next(slot: Slot) {
		if (slot.at < slot.history.length - 1) {
			slot.at += 1;
		} else {
			replace(slot);
		}
		settle(slot);
	}

	/** Something it has not shown, whatever its history: for the rotation and a new feed. */
	function replace(slot: Slot) {
		const key = draw(slot.kind, slot);
		if (key !== null) {
			slot.history = [...slot.history.slice(slot.at + 1 - HISTORY, slot.at + 1), key];
			slot.at = slot.history.length - 1;
		}
		settle(slot);
	}

	function back(slot: Slot) {
		if (slot.at > 0) {
			slot.at -= 1;
		}
		settle(slot);
	}

	/**
	 * Every place's own clock: how long its picture has been up, in ms. Plain
	 * rather than state: it ticks four times a second, and nothing shows it.
	 */
	const elapsed = new Map<number, number>();
	/** The places a pointer is over: their clocks stand still. */
	const hovered = new Set<number>();

	/**
	 * A clip shows what it wants at once (its player keeps the old one up
	 * meanwhile). Either way the place's clock starts again: going forward or
	 * back gives the one arrived at its full time.
	 */
	function settle(slot: Slot) {
		elapsed.set(slot.id, 0);
		if (slot.kind === 'clip') {
			slot.shown = wanted(slot);
		}
	}

	/** Pointed at, a picture is being looked at: it stays until the pointer leaves. */
	function pausesOnHover(slot: Slot) {
		return (node: HTMLElement) => {
			const enter = () => hovered.add(slot.id);
			const leave = () => hovered.delete(slot.id);
			node.addEventListener('pointerenter', enter);
			node.addEventListener('pointerleave', leave);
			return () => {
				node.removeEventListener('pointerenter', enter);
				node.removeEventListener('pointerleave', leave);
				hovered.delete(slot.id);
			};
		};
	}

	/** Move on, unless something in the column is enlarged: then once it is put back. */
	function moveOn(slot: Slot, how: (slot: Slot) => void) {
		if (slot.locked) {
			return;
		}
		if (enlarged > 0) {
			due.add(slot.id);
			return;
		}
		how(slot);
	}

	function counted(open: boolean) {
		enlarged = Math.max(0, enlarged + (open ? 1 : -1));
		if (enlarged === 0 && due.size > 0) {
			for (const slot of slots) {
				if (due.has(slot.id) && !slot.locked) {
					replace(slot);
				}
			}
			due.clear();
		}
	}

	// The rotation: each picture moves on once it has been up long enough,
	// on its own clock, which counts only while it is on show — not locked,
	// not pointed at, not still loading, and nothing in the column enlarged.
	$effect(() => {
		const timer = setInterval(() => {
			if (enlarged > 0) {
				return;
			}
			for (const slot of slots) {
				if (
					slot.kind !== 'picture' ||
					slot.locked ||
					hovered.has(slot.id) ||
					slot.shown !== wanted(slot)
				) {
					continue;
				}
				const up = (elapsed.get(slot.id) ?? 0) + TICK_MS;
				elapsed.set(slot.id, up);
				if (up >= ROTATE_MS) {
					replace(slot);
				}
			}
		}, TICK_MS);
		return () => clearInterval(timer);
	});

	// A new feed — "New porn", or new settings — moves every place not locked
	// on to something from it, drawn from its start.
	let feedSeen: { images: readonly string[]; clips: readonly Clip[] } | null = null;
	$effect(() => {
		const feed = { images, clips };
		untrack(() => {
			if (feedSeen === null) {
				feedSeen = feed;
				return;
			}
			feedSeen = feed;
			pictureCursor = 0;
			clipCursor = 0;
			for (const slot of slots) {
				moveOn(slot, replace);
			}
		});
	});

	/** Learnt shapes, width over height: by picture URL, `clip:<id>`, and `lead`. */
	let shapes = $state<Record<string, number>>({});
	let panelWidth = $state(0);
	let panelHeight = $state(0);

	const shapeKey = (slot: Slot) => (slot.kind === 'clip' ? `clip:${slot.shown}` : slot.shown);

	/** A length along the column (a height) or strip (a width), for a shape. */
	function lengthFor(ratio: number): number {
		return orientation === 'column' ? panelWidth / ratio : panelHeight * ratio;
	}
	const leadLength = $derived(lengthFor(shapes.lead ?? GUESSED.lead));
	const slotLength = (slot: Slot) => lengthFor(shapes[shapeKey(slot)] ?? GUESSED[slot.kind]);

	/**
	 * As many pictures as come nearest to filling the column (see
	 * `fitCount`): more drawn as it grows, the last ones not locked let go as
	 * it shrinks. The clip, and the hypno, always stay. Not while anything is
	 * enlarged, which holds the column as it is.
	 */
	$effect(() => {
		const space = orientation === 'column' ? panelHeight : panelWidth;
		if (enlarged > 0 || space <= 0) {
			return;
		}
		untrack(() => {
			const clipSlot = slots.find((slot) => slot.kind === 'clip');
			if (!clipSlot && playable.length > 0) {
				const made = newSlot('clip');
				if (made) {
					slots = [made, ...slots];
				}
			} else if (clipSlot && playable.length === 0) {
				slots = slots.filter((slot) => slot !== clipSlot);
			}
		});
		const fixed = [
			...(lead ? [leadLength] : []),
			...slots.filter((s) => s.kind === 'clip').map(slotLength)
		];
		const pictures = slots.filter((slot) => slot.kind === 'picture');
		const guess = lengthFor(GUESSED.picture);
		const lengths = [
			...fixed,
			...pictures.map(slotLength),
			...Array.from({ length: Math.max(0, MOST_PICTURES - pictures.length) }, () => guess)
		];
		const wantedPictures = Math.min(
			images.length,
			fitCount(lengths, space, gap, Math.max(1, fixed.length)) - fixed.length
		);
		untrack(() => {
			let current = slots.filter((slot) => slot.kind === 'picture').length;
			const added: Slot[] = [];
			while (current + added.length < wantedPictures) {
				const made = newSlot('picture');
				if (!made) {
					break;
				}
				added.push(made);
				// Drawn one at a time, so each sees the last as taken.
				slots = [...slots, made];
			}
			current += added.length;
			if (current > wantedPictures) {
				let excess = current - wantedPictures;
				const keep = [...slots].reverse().filter((slot) => {
					if (excess > 0 && slot.kind === 'picture' && !slot.locked) {
						excess -= 1;
						return false;
					}
					return true;
				});
				slots = keep.reverse();
			}
		});
	});

	/** In order: the clip, then the pictures (the hypno, when there is one, before both). */
	const ordered = $derived([
		...slots.filter((slot) => slot.kind === 'clip'),
		...slots.filter((slot) => slot.kind === 'picture')
	]);

	/**
	 * A picture that will not load is passed over for another — but only a
	 * few times running: a host blocked outright (see `media-log.ts`) would
	 * otherwise have it trying every picture in the feed, one after another,
	 * for ever. After that it gives up and shows the empty frame.
	 */
	const MOST_FAILURES = 3;

	function failed(slot: Slot) {
		slot.failures += 1;
		const key = slot.failures < MOST_FAILURES ? draw('picture', slot) : null;
		if (key === null) {
			slot.shown = wanted(slot);
			return;
		}
		slot.history = slot.history.map((entry, index) => (index === slot.at ? key : entry));
	}

	function loaded(slot: Slot) {
		slot.failures = 0;
		slot.shown = wanted(slot);
		// Its time starts once it can be seen, not while it was loading.
		elapsed.set(slot.id, 0);
	}

	/** Listened for by hand: the picture loading out of sight is not one to press. */
	function preloads(slot: Slot) {
		return (img: HTMLImageElement) => {
			const onLoad = () => loaded(slot);
			const onError = () => failed(slot);
			img.addEventListener('load', onLoad);
			img.addEventListener('error', onError);
			return () => {
				img.removeEventListener('load', onLoad);
				img.removeEventListener('error', onError);
			};
		};
	}

	/**
	 * Learn each picture's and video's shape as it loads — `load` and
	 * `loadedmetadata` do not bubble, so caught on the way down — and any
	 * already loaded when it arrives (the hypno's video, moved in playing).
	 * Keyed by what it shows, not where: a picture by its URL, a clip by its
	 * id, the hypno as `lead`.
	 */
	function learnsShapes(panel: HTMLElement) {
		const keyOf = (media: Element): string | null => {
			if (media instanceof HTMLVideoElement && media.dataset.clip) {
				return `clip:${media.dataset.clip}`;
			}
			if (media instanceof HTMLImageElement) {
				return media.getAttribute('src');
			}
			return media.closest<HTMLElement>('[data-key]')?.dataset.key ?? null;
		};
		const learn = (media: Element) => {
			const key = keyOf(media);
			if (!key) {
				return;
			}
			let ratio = 0;
			if (media instanceof HTMLImageElement && media.naturalHeight > 0) {
				ratio = media.naturalWidth / media.naturalHeight;
			} else if (media instanceof HTMLVideoElement && media.videoHeight > 0) {
				ratio = media.videoWidth / media.videoHeight;
			}
			if (ratio > 0 && Math.abs((shapes[key] ?? 0) - ratio) > 0.01) {
				shapes[key] = ratio;
			}
		};
		const onLoad = (event: Event) => {
			if (event.target instanceof Element) {
				learn(event.target);
			}
		};
		const learnAll = () => {
			for (const media of panel.querySelectorAll('img, video')) {
				learn(media);
			}
		};
		panel.addEventListener('load', onLoad, true);
		panel.addEventListener('loadedmetadata', onLoad, true);
		const arrivals = new MutationObserver(learnAll);
		arrivals.observe(panel, { childList: true, subtree: true });
		learnAll();
		return () => {
			panel.removeEventListener('load', onLoad, true);
			panel.removeEventListener('loadedmetadata', onLoad, true);
			arrivals.disconnect();
		};
	}
</script>

{#snippet controlsFor(slot: Slot, name: string)}
	<!--
		Native buttons: the lock is a toggle, with `aria-pressed`, which a
		wa-button would not forward; the others match it.
	-->
	<button
		type="button"
		class="control"
		aria-label="Previous {name}"
		data-caption="Back to the last {name}"
		disabled={slot.at === 0}
		onclick={() => back(slot)}
	>
		<wa-icon name="backward-step" variant="solid"></wa-icon>
	</button>
	<button
		type="button"
		class="control"
		aria-label="Keep this {name}"
		aria-pressed={slot.locked}
		data-caption={slot.locked
			? 'Kept: press to let it change again'
			: `Keep this ${name}, so it is never swapped out`}
		onclick={() => {
			slot.locked = !slot.locked;
		}}
	>
		<wa-icon name={slot.locked ? 'lock' : 'lock-open'} variant="solid"></wa-icon>
	</button>
	<button
		type="button"
		class="control"
		aria-label="Next {name}"
		data-caption="Show another {name}"
		onclick={() => next(slot)}
	>
		<wa-icon name="forward-step" variant="solid"></wa-icon>
	</button>
{/snippet}

<aside
	class="media-panel {orientation}"
	aria-label="Porn"
	style:gap="{gap}px"
	bind:clientWidth={panelWidth}
	bind:clientHeight={panelHeight}
	{@attach learnsShapes}
>
	{#if lead}
		<div class="slot" data-key="lead" style:flex-grow={Math.max(1, Math.round(leadLength))}>
			<EnlargeableItem name="hypno" onchange={counted} testid="hypno-item" origin={leadOrigin}>
				{#snippet footer()}
					<ClipScrubber name="hypno" />
				{/snippet}
				{@render lead()}
			</EnlargeableItem>
		</div>
	{/if}
	{#each ordered as slot (slot.id)}
		<!-- Grows in proportion to its natural length, so all scale alike to fill. -->
		<div
			{@attach pausesOnHover(slot)}
			class="slot"
			data-key={shapeKey(slot)}
			data-testid={slot.kind === 'clip' ? 'clip-slot' : 'picture-slot'}
			style:flex-grow={Math.max(1, Math.round(slotLength(slot)))}
		>
			{#if slot.kind === 'clip'}
				<EnlargeableItem
					name="clip"
					testid="clip-item"
					locked={slot.locked}
					loading={slot.loading}
					origin={origins[originKey({ kind: 'clip', key: slot.shown })] ?? null}
					onchange={(open) => {
						counted(open);
						onenlarge?.(open);
					}}
				>
					{#snippet controls()}
						{@render controlsFor(slot, 'clip')}
					{/snippet}
					{#snippet footer()}
						<ClipScrubber name="clip" />
					{/snippet}
					{#if clipsById.has(wanted(slot))}
						<ClipPlayer
							clip={clipsById.get(wanted(slot)) as Clip}
							audible={audible && (clipsById.get(wanted(slot))?.sound ?? false)}
							bind:loading={slot.loading}
							onended={() => moveOn(slot, next)}
						/>
					{/if}
				</EnlargeableItem>
			{:else}
				<EnlargeableItem
					name="picture"
					locked={slot.locked}
					origin={origins[originKey({ kind: 'picture', key: slot.shown })] ?? null}
					loading={slot.shown !== wanted(slot)}
					onchange={counted}
				>
					{#snippet controls()}
						{@render controlsFor(slot, 'picture')}
					{/snippet}
					{#if slot.shown}
						<img src={slot.shown} alt="" referrerpolicy="no-referrer" decoding="async" />
					{/if}
					{#if slot.shown !== wanted(slot)}
						<!-- The next one, loading out of sight; it takes the place of the one above once it has. -->
						<img
							{@attach trackImage}
							class="preload"
							src={wanted(slot)}
							alt=""
							referrerpolicy="no-referrer"
							{@attach preloads(slot)}
						/>
					{/if}
				</EnlargeableItem>
			{/if}
		</div>
	{/each}
</aside>

<style>
	.media-panel {
		display: flex;
		overflow: hidden;

		&.column {
			flex-direction: column;
			block-size: 100%;
		}

		/* Its box's height, not its content's: the strip's, which the pictures
		   are fitted to. */
		&.row {
			flex-direction: row;
			inline-size: 100%;
			block-size: 100%;
		}
	}

	/* A share of the panel, by its natural length (see `shown`); never its
	   content's size, which would overflow. */
	.slot {
		flex-shrink: 1;
		flex-basis: 0;
		min-inline-size: 0;
		min-block-size: 0;
		display: flex;
		border-radius: var(--wa-border-radius-m);
		overflow: hidden;
	}

	/* The item fills its slot, and what is in it fills the item, cropped to
	   fit: only while in the column. Enlarged, it has its own rules. */
	.slot :global(.item:not(:popover-open)) {
		flex: 1 1 auto;
		min-inline-size: 0;
		min-block-size: 0;
	}

	.slot
		:global(
			.item:not(:popover-open) :is(img, video, iframe, .loading, .hypno-slot, .hypno-slot video)
		) {
		display: block;
		inline-size: 100%;
		block-size: 100%;
		max-block-size: none;
		aspect-ratio: auto;
		border: none;
		border-radius: 0;
		object-fit: cover;
	}

	/* Loading out of sight: still laid out, so the browser fetches it. */
	.slot :global(.item img.preload) {
		position: absolute;
		inset: 0;
		opacity: 0;
		pointer-events: none;
	}

	.slot :global(.item:not(:popover-open) img) {
		background: var(--wa-color-neutral-fill-quiet);
		animation: fade-in 600ms ease;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
</style>
