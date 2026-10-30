<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { page } from '$app/state';
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import { unlockedIdentity } from '$lib/crypto/session.svelte';
	import type { View } from '$lib/dream/build';
	import { colourValues } from '$lib/dream/colours';
	import { elementLabel, linkableNames } from '$lib/dream/elements';
	import { fieldKey } from '$lib/dream/fields';
	import { suggestionsIn } from '$lib/dream/footer';
	import {
		explicitOoc,
		isReading,
		READING_CHOICES,
		READINGS,
		type Reading,
		turnReading
	} from '$lib/dream/readings';
	import { footerOf } from '$lib/dream/story';
	import { DEFAULT_STYLE, isPreset, OWN_STYLE, STYLE_PRESETS } from '$lib/dream/styles';
	import { voiceForSpeaker } from '$lib/dream/voices';
	import { ReadAloud, SPEEDS, type SpokenReport } from '$lib/dream-browser/reader.svelte';
	import { loadReadingOptions, saveReadingOptions } from '$lib/dream-browser/reading-options';
	import type { DreamSession } from '$lib/dream-browser/session.svelte';
	import { chime, StillListening } from '$lib/dream-browser/still-listening.svelte';
	import { type DraftSession, openDraft } from '$lib/messaging/drafts';
	import { MAX_INPUT_CHARS, MAX_PASSAGE_CHARS } from '$lib/sealed-kinds/dreams';
	import type { FishVoicePresetId } from '$lib/server-settings';
	import DreamCard from './DreamCard.svelte';
	import DreamExchange from './DreamExchange.svelte';
	import DreamMarkup, { type MarkupInputs } from './DreamMarkup.svelte';
	import DreamNotices from './DreamNotices.svelte';
	import DreamTextBox from './DreamTextBox.svelte';
	import DreamVoices from './DreamVoices.svelte';
	import { elementIcon } from './element-icons';

	/**
	 * Playing a daydream (docs/dreams.md, "Playing"): the branch being read,
	 * each passage with its versions and what can be done to it, the cards,
	 * and the user's turn. Retry, Another take and Edit each add a version
	 * beside the passage rather than replacing it.
	 */
	let {
		session,
		pictures: picturesOn = false,
		voice = null,
		onsetup
	}: {
		session: DreamSession;
		pictures?: boolean;
		/** Opens how it was set up (docs/dreams.md, "The setup page"). */
		onsetup?: () => void;
		/** Read aloud, when this server and account have it. */
		voice?: { narratorPreset: FishVoicePresetId | null } | null;
	} = $props();

	const pictures = $derived({
		enabled: picturesOn,
		url: (key: string) => session.pictures[key],
		has: (key: string) => session.hasPicture(key),
		making: (key: string) => session.filling.has(key),
		show: (key: string) => session.showPicture(key),
		draw: (key: string, picture: { of: string; caption: string }) => {
			const turnId = key.split(':')[0] ?? '';
			void session.drawPicture(turnId, key, picture);
		}
	});

	const elements = $derived(session.elements);
	/** Each person's colour (docs/dreams.md, "Colours"): their speech, name, card and chip. */
	const colours = $derived(colourValues(elements));
	const names = $derived(linkableNames(elements));
	const expansions = $derived(session.expansions);
	/** Blocks designed for this daydream, by kind (docs/dreams.md, "Designed blocks"). */
	const designs = $derived(
		new Map((session.setup?.designs ?? []).map((design) => [design.kind, design]))
	);
	const build = $derived(session.setup?.build ?? null);

	let cardId = $state<string | null>(null);
	/** Debug mode, on this device for an account that holds it: display only. */
	const debugOn = $derived(Boolean(page.data.debug));
	/** The passage whose request is shown, in debug mode. */
	let aboutId = $state<string | null>(null);
	const about = $derived(
		aboutId ? session.path.find((entry) => entry.id === aboutId)?.turn : undefined
	);

	function showAbout(turnId: string) {
		aboutId = turnId;
	}

	function cachedShare(usage: { promptTokens: number; cachedTokens: number }): number {
		return usage.promptTokens > 0 ? Math.round((usage.cachedTokens / usage.promptTokens) * 100) : 0;
	}
	let turnBox = $state<ReturnType<typeof DreamTextBox> | null>(null);
	/** Whether the voices dialog is open. */
	let voicesOpen = $state(false);
	/** The dock at the bottom, which the line being read is kept in sight above. */
	let dock = $state<HTMLElement | null>(null);
	/** Whether the turn box is open: put away, it is a button drawn as the box it opens into. */
	let writing = $state(false);
	const suggested = $derived(
		session.lastPassage ? suggestionsIn(footerOf(session.lastPassage.turn.source)) : []
	);

	/**
	 * A change to the turn area, morphed from what it was where the browser
	 * can (a view transition: the button grows into the box), and made at
	 * once where it cannot or the device asks for less motion.
	 */
	function morph(change: () => void, after?: () => void) {
		const still = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (still || !('startViewTransition' in document)) {
			change();
			void tick().then(after);
			return;
		}
		const transition = document.startViewTransition(async () => {
			change();
			await tick();
		});
		void transition.updateCallbackDone.then(after);
	}

	/** Opens the turn box, focused, with a suggestion in it to change first when given one. */
	function openReply(text?: string) {
		morph(
			() => {
				writing = true;
				if (text !== undefined) {
					turnBox?.put(text);
				}
			},
			() => turnBox?.focus()
		);
	}

	/**
	 * Whether the turn area is stuck to the bottom over the story, rather than
	 * sitting at its end: it takes a background only then, as the kink list's
	 * pinned bar does at the top. Watched with a sentinel just after it, which
	 * is out of sight below exactly when it is stuck; the viewport is the
	 * root, as the app shell's <main> scrolls inside it.
	 */
	let stuck = $state(false);
	const watchStuck: Attachment<HTMLElement> = (sentinel) => {
		const observer = new IntersectionObserver(([entry]) => {
			// Hidden below: clipped by <main>, which may still be inside the viewport.
			stuck = entry !== undefined && !entry.isIntersecting && entry.boundingClientRect.top > 0;
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	};

	/**
	 * Keeps the turn area scrolled to its end whenever what it holds changes
	 * size: when it is too tall for its half of the screen, the box and the
	 * last chips are what should be in sight, as they are nearest the thumb.
	 */
	const startAtEnd: Attachment<HTMLElement> = (scroller) => {
		const toEnd = () => {
			scroller.scrollTop = scroller.scrollHeight;
		};
		const observer = new ResizeObserver(toEnd);
		for (const child of scroller.children) {
			observer.observe(child);
		}
		toEnd();
		return () => observer.disconnect();
	};

	/** How long a suggestion is held before it is put in the box rather than sent. */
	const HOLD_MS = 500;
	/** How far a finger may drift and still be holding, not scrolling. */
	const HOLD_SLOP_PX = 10;

	/**
	 * A suggestion held, rather than tapped, goes into the box to be changed
	 * before it is sent. A timer, because iOS sends no `contextmenu` for a long
	 * press; and `contextmenu` itself, which is Android's long press, a right
	 * click and the keyboard's menu key, so it is not only for touch. The tap
	 * that ends a hold is swallowed, so the suggestion is not sent as well.
	 */
	function holdToChange(suggestion: string): Attachment<HTMLElement> {
		return (element) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			let held = false;
			let startX = 0;
			let startY = 0;
			const cancel = () => {
				clearTimeout(timer);
				timer = undefined;
			};
			const change = () => {
				cancel();
				held = true;
				openReply(suggestion);
			};
			const down = (event: PointerEvent) => {
				held = false;
				startX = event.clientX;
				startY = event.clientY;
				timer = setTimeout(change, HOLD_MS);
			};
			const move = (event: PointerEvent) => {
				if (Math.hypot(event.clientX - startX, event.clientY - startY) > HOLD_SLOP_PX) {
					cancel();
				}
			};
			const menu = (event: Event) => {
				event.preventDefault();
				if (!held) {
					change();
				}
			};
			// Before Svelte's own click handler, which listens at the root.
			const click = (event: Event) => {
				if (held) {
					event.preventDefault();
					event.stopPropagation();
					held = false;
				}
			};
			element.addEventListener('pointerdown', down);
			element.addEventListener('pointermove', move);
			for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
				element.addEventListener(type, cancel);
			}
			element.addEventListener('contextmenu', menu);
			element.addEventListener('click', click);
			return () => {
				cancel();
				element.removeEventListener('pointerdown', down);
				element.removeEventListener('pointermove', move);
				for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
					element.removeEventListener(type, cancel);
				}
				element.removeEventListener('contextmenu', menu);
				element.removeEventListener('click', click);
			};
		};
	}

	/** Puts the box away; what it holds stays as a draft, shown on the button. */
	function closeReply() {
		morph(() => {
			writing = false;
		});
	}
	let editing = $state<{ turnId: string; source: string } | null>(null);
	const card = $derived(elements.find((element) => element.id === cardId) ?? null);

	function openCard(id: string) {
		cardId = id;
		void session.fillCard(id);
	}

	function expand(turnId: string, key: string, phrase: string) {
		if (!expansions.has(key)) {
			void session.expand(turnId, key, phrase);
		}
	}

	// ── what the user sets in a passage ─────────────────────────────────────

	const answering = $derived(session.lastPassage?.id ?? null);

	/** The passage being answered takes input; the rest show what was sent after them. */
	function inputsFor(turnId: string, index: number): MarkupInputs {
		if (turnId === answering && !session.busy) {
			return {
				live: true,
				choices: session.choices,
				values: session.values,
				setChoice: (id, value) => session.setChoice(id, value),
				setValue: (key, value) => session.setValue(key, value),
				done: () => void session.send(''),
				answer: (question, answer, remember) =>
					void session.answerQuestion(question, answer, remember),
				roll: (offered) => void session.roll(offered)
			};
		}
		const after = session.path[index + 1]?.turn;
		if (after?.kind !== 'input') {
			return { live: false, choices: {}, values: {} };
		}
		return {
			live: false,
			choices: Object.fromEntries(after.cycles.map((cycle) => [cycle.id, cycle.value])),
			values: Object.fromEntries(
				after.fields.map((field) => [fieldKey(field.block, field.name), field.value])
			),
			answered: Object.fromEntries(after.answers.map((answer) => [answer.id, answer.text])),
			rolled: Object.fromEntries(after.rolls.map((rolled) => [rolled.id, rolled.value]))
		};
	}

	// Half-filled fields are kept, encrypted, like anything typed.
	let inputsDraft: DraftSession | null = null;
	onMount(() => {
		void openDraft({ kind: 'dream-inputs', dreamId: session.id }, unlockedIdentity()).then(
			(draft) => {
				inputsDraft = draft;
				try {
					const saved = draft.initial ? JSON.parse(draft.initial.text) : null;
					if (saved && typeof saved.turnId === 'string') {
						session.restoreInputs(saved);
					}
				} catch {
					// A draft that will not read is no draft.
				}
			}
		);
	});
	$effect(() => {
		const set = Object.keys(session.choices).length + Object.keys(session.values).length > 0;
		const text = set
			? JSON.stringify({ turnId: answering, choices: session.choices, values: session.values })
			: '';
		inputsDraft?.save({ text, tagIds: [] });
	});

	// ── how a turn was read ──────────────────────────────────────────────────

	/**
	 * How the passage after a turn read it (docs/dreams.md, "How a turn is
	 * read"): from the passage kept after it, or the one arriving. A turn in
	 * out-of-character syntax is that, whatever the model said.
	 */
	function answerTo(
		turnId: string,
		index: number
	): { reading: Reading | null; yours: string | null; chosen: Reading | null } {
		const next = session.path[index + 1]?.turn;
		const input = session.path[index]?.turn;
		const ooc = input?.kind === 'input' && explicitOoc(input.text);
		let found: { reading: Reading | null; yours: string | null } = { reading: null, yours: null };
		let chosen: Reading | null = null;
		if (next?.kind === 'passage') {
			found = turnReading(next.source);
			chosen = next.readAs ?? null;
		} else if (session.streaming?.what === 'passage' && session.streaming.parentId === turnId) {
			found = turnReading(session.streaming.text);
		}
		const reading = chosen ?? (ooc ? 'ooc' : found.reading);
		return { reading, yours: reading === 'instruction' ? found.yours : null, chosen };
	}

	let showingSent = $state(new Set<string>());

	function toggleSent(turnId: string) {
		const next = new Set(showingSent);
		if (!next.delete(turnId)) {
			next.add(turnId);
		}
		showingSent = next;
	}

	function reread(event: WaSelectEvent, turnId: string) {
		const choice = event.detail.item.value;
		if (isReading(choice)) {
			void session.reread(turnId, choice);
		}
	}

	// ── pull to continue ─────────────────────────────────────────────────────

	/** How far the page is pulled past its end, in pixels, damped. */
	let pulled = $state(0);
	const PULL_TO_CONTINUE = 72;
	const PULL_MOST = 120;
	const SCROLLS = /auto|scroll/;

	/**
	 * Pulling the page up past its end on a touch screen, and letting go,
	 * is Continue (docs/dreams.md, "Pull to continue"), with the pull drawn
	 * as it stretches. Touch only: a trackpad's fling runs on past the end by
	 * itself and would continue by accident. Only when the newest turn is a
	 * passage and nothing is being written; the Continue button stays for
	 * everyone else.
	 */
	const pullToContinue: Attachment<HTMLElement> = (element) => {
		let scroller: HTMLElement | null = element.parentElement;
		while (scroller && !SCROLLS.test(getComputedStyle(scroller).overflowY)) {
			scroller = scroller.parentElement;
		}
		const area = scroller ?? document.documentElement;
		let startY: number | null = null;
		const atEnd = () => area.scrollTop + area.clientHeight >= area.scrollHeight - 2;
		const ready = () => !session.busy && session.path.at(-1)?.turn?.kind === 'passage';
		const onStart = (event: TouchEvent) => {
			startY = atEnd() && ready() ? (event.touches[0]?.clientY ?? null) : null;
		};
		const onMove = (event: TouchEvent) => {
			if (startY === null) {
				return;
			}
			const distance = startY - (event.touches[0]?.clientY ?? startY);
			pulled = distance > 0 ? Math.min(PULL_MOST, distance * 0.5) : 0;
		};
		const onEnd = () => {
			if (pulled >= PULL_TO_CONTINUE && ready()) {
				void session.send('');
			}
			pulled = 0;
			startY = null;
		};
		area.addEventListener('touchstart', onStart, { passive: true });
		area.addEventListener('touchmove', onMove, { passive: true });
		area.addEventListener('touchend', onEnd);
		area.addEventListener('touchcancel', onEnd);
		return () => {
			area.removeEventListener('touchstart', onStart);
			area.removeEventListener('touchmove', onMove);
			area.removeEventListener('touchend', onEnd);
			area.removeEventListener('touchcancel', onEnd);
		};
	};

	// ── a passage's menu ─────────────────────────────────────────────────────

	type WaSelectEvent = CustomEvent<{ item: HTMLElement & { value?: string } }>;

	/** What the menu at a passage's end does: its items' values. */
	function act(event: WaSelectEvent, turnId: string, source: string) {
		// The property, not the attribute: Lit does not reflect what Svelte sets (AGENTS.md).
		const choice = event.detail.item.value;
		if (choice === 'listen') {
			listen(turnId);
		} else if (choice === 'take') {
			void session.anotherTake(turnId);
		} else if (choice === 'different') {
			void session.differentDirection(turnId);
		} else if (choice === 'edit') {
			editing = { turnId, source };
		}
	}

	// ── read aloud ───────────────────────────────────────────────────────────

	// svelte-ignore state_referenced_locally
	// Made once: whether this server reads aloud does not change while the
	// page is open, and the reader holds the clips already fetched.
	const reader = voice
		? new ReadAloud({
				voiceOf: (who) => voiceForSpeaker(who, session.setup?.voices),
				nameOf: (who) => speakerName(who),
				onNearEnd: keepGoing,
				onFinished: carryOn,
				// A press of play or pause answers "Still listening?" if it is up,
				// as its buttons would: the user is plainly there.
				onControl: (control) => {
					if (stillListening.asking) {
						stillListening.answer(control !== 'pause');
					} else {
						stillListening.active();
					}
				},
				upNext: (turnId) => {
					const next = readOnInto(turnId);
					const root = next ? passageRoot(next) : null;
					return next && root ? { turnId: next, root } : null;
				},
				onPosition: (turnId, index, done) => savePosition({ turnId, index, done }),
				coveredFrom: () => dock?.getBoundingClientRect().top ?? null,
				onSpoken: (turnId, spoken) =>
					session.noteExtra(turnId, {
						kind: 'speech',
						label: spoken.text,
						exchange: {
							request: spoken.request,
							reply: spokenReply(spoken),
							thinking: '',
							provider: 'Fish Audio',
							...(spoken.latencyMs === undefined ? {} : { latencyMs: spoken.latencyMs })
						}
					})
			})
		: null;
	onDestroy(() => reader?.dispose());

	// "Still listening?": with Keep going on, once nobody has touched the page
	// for a while it asks, and pauses unanswered, so a phone left playing in
	// an empty room does not write and read all night (docs/dreams.md, "Keep
	// going"). Every sign of someone there counts: a tap, a key, the mouse,
	// a scroll of their own, and a media key or headphone button (the reader's
	// `onControl`). Checked every second; a page playing audio is not
	// throttled in the background, which is where this matters most.
	const stillListening = new StillListening();
	onMount(() => {
		const active = () => stillListening.active();
		const signs = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
		for (const sign of signs) {
			document.addEventListener(sign, active, { capture: true, passive: true });
		}
		const timer = setInterval(() => {
			if (!reader) {
				return;
			}
			const running = reader.keepGoing && !reader.paused && (reader.playing || reader.loading);
			const step = stillListening.tick(running);
			if (step === 'warn') {
				chime();
			} else if (step === 'pause') {
				reader.pause();
			}
		}, 1000);
		return () => {
			clearInterval(timer);
			for (const sign of signs) {
				document.removeEventListener(sign, active, { capture: true });
			}
		};
	});

	function answerStillListening(keepPlaying: boolean) {
		if (!stillListening.asking) {
			return;
		}
		stillListening.answer(keepPlaying);
		if (!keepPlaying) {
			reader?.pause();
		}
	}

	// Read aloud and the player's options are as the user left them, on this
	// device, for every daydream. Restored before anything is saved, so the
	// defaults the page starts with never overwrite them.
	let optionsLoaded = $state(false);
	onMount(() => {
		const options = loadReadingOptions();
		if (reader) {
			session.listening = options.listening;
			reader.readNew = options.readNew;
			reader.setHighlight(options.highlight);
			reader.setKeepGoing(options.keepGoing);
			reader.setRate(options.rate);
		}
		optionsLoaded = true;
	});
	$effect(() => {
		if (optionsLoaded && reader) {
			saveReadingOptions({
				listening: session.listening,
				readNew: reader.readNew,
				highlight: reader.highlight,
				keepGoing: reader.keepGoing,
				rate: reader.rate
			});
		}
	});

	function speakerName(who: string | null): string {
		if (who === 'you') {
			return 'You';
		}
		const element = session.elements.find((candidate) => candidate.id === who);
		return element ? elementLabel(element) : 'Narrator';
	}

	/** The passage's drawn text, which is what is read. */
	function passageRoot(turnId: string): HTMLElement | null {
		return document.querySelector<HTMLElement>(`[data-turn="${CSS.escape(turnId)}"] .markup`);
	}

	/**
	 * "Keep going": as reading nears the end of the newest passage, the story
	 * carries on as Continue would, so the next passage is being written while
	 * this one finishes, and is read once it is there. Not while the user is
	 * writing, or anything else is running.
	 */
	function keepGoing(turnId: string) {
		if (
			reader?.keepGoing &&
			session.listening &&
			turnId === session.lastPassage?.id &&
			!session.busy &&
			!writing
		) {
			void session.send('');
		}
	}

	/**
	 * Keep going on or off. Turned on once the newest passage has already
	 * been read to its end, the next is asked for now, as it would have been
	 * near the end; the reader does the same for one still playing.
	 */
	function toggleKeepGoing() {
		if (!reader) {
			return;
		}
		reader.setKeepGoing(!reader.keepGoing);
		if (reader.keepGoing && reader.finishedTurn) {
			keepGoing(reader.finishedTurn);
		}
	}

	/** A clip's reply, for debug mode: how much audio came, and each word's timing. */
	function spokenReply(spoken: SpokenReport): string {
		const timings = spoken.words.map(
			(word) => `${word.start.toFixed(2)}–${word.end.toFixed(2)}  ${word.text}`
		);
		return [`${spoken.bytes} bytes of audio, ${spoken.words.length} words timed:`, ...timings].join(
			'\n'
		);
	}

	/** The passage after this one on the path the story is on, or null. */
	function passageAfter(turnId: string): string | null {
		const passages = session.path.filter((entry) => entry.turn?.kind === 'passage');
		const at = passages.findIndex((entry) => entry.id === turnId);
		return at >= 0 ? (passages[at + 1]?.id ?? null) : null;
	}

	/** The passage before this one on the path the story is on, or null. */
	function passageBefore(turnId: string): string | null {
		const passages = session.path.filter((entry) => entry.turn?.kind === 'passage');
		const at = passages.findIndex((entry) => entry.id === turnId);
		return at > 0 ? (passages[at - 1]?.id ?? null) : null;
	}

	/**
	 * Where reading got to in this daydream, on this device, so play after a
	 * reload carries on from there (docs/dreams.md, "Read aloud"). In local
	 * storage: a turn's id and a count, never any words, and a convenience,
	 * so a storage that is not there only means starting from the newest.
	 */
	type ReadingPosition = { turnId: string; index: number; done: boolean };
	const positionKey = $derived(`dream-reading:${session.id}`);

	function savePosition(position: ReadingPosition) {
		try {
			localStorage.setItem(positionKey, JSON.stringify(position));
		} catch {
			// Storage refused (a private window): it only means no carrying on.
		}
	}

	function savedPosition(): ReadingPosition | null {
		try {
			const value: unknown = JSON.parse(localStorage.getItem(positionKey) ?? 'null');
			if (
				typeof value === 'object' &&
				value !== null &&
				'turnId' in value &&
				typeof value.turnId === 'string' &&
				'index' in value &&
				typeof value.index === 'number' &&
				'done' in value
			) {
				return { turnId: value.turnId, index: value.index, done: value.done === true };
			}
		} catch {
			// Unreadable: as if there were none.
		}
		return null;
	}

	/**
	 * Play with nothing playing: from where reading got to, if that passage is
	 * on this branch; the passage after it if that one was finished (or it
	 * again, with none after); else the newest passage, from its start.
	 */
	function carryOnReading() {
		const saved = savedPosition();
		const onPath =
			saved !== null &&
			session.path.some((entry) => entry.id === saved.turnId && entry.turn?.kind === 'passage');
		if (!(saved && onPath)) {
			if (session.lastPassage) {
				listen(session.lastPassage.id);
			}
			return;
		}
		if (saved.done) {
			listen(passageAfter(saved.turnId) ?? saved.turnId);
			return;
		}
		const root = passageRoot(saved.turnId);
		if (reader && root) {
			reader.play(saved.turnId, root, undefined, saved.index);
		}
	}

	function listen(turnId: string, at?: { x: number; y: number }) {
		// Asked twice for the same passage (read new passages, and carrying
		// on from the end, both want the next one): once is enough.
		if (!at && reader?.turnId === turnId && (reader.playing || reader.loading)) {
			return;
		}
		const root = passageRoot(turnId);
		if (reader && root) {
			reader.play(turnId, root, at);
		}
	}

	function toggleListening() {
		session.listening = !session.listening;
		// Read new passages stays as it was: it only acts while listening, and
		// is one of the options kept for next time.
		if (!session.listening) {
			reader?.stop();
		}
	}

	/**
	 * With read aloud on, a tap on any word of a passage plays from it, before
	 * play has been pressed as much as while it reads (docs/dreams.md, "Read
	 * aloud"). Only a pointer's shortcut, like the tap-through's tap: Listen
	 * and the player are the controls for the keyboard and a screen reader.
	 */
	function tapToListen(turnId: string): Attachment<HTMLElement> {
		return (element) => {
			const onClick = (event: MouseEvent) => {
				if (
					reader &&
					session.listening &&
					!(
						event.target instanceof Element &&
						event.target.closest('button, a, input, wa-input, wa-button')
					)
				) {
					listen(turnId, { x: event.clientX, y: event.clientY });
				}
			};
			element.addEventListener('click', onClick);
			return () => element.removeEventListener('click', onClick);
		};
	}

	function nextSpeed() {
		if (reader) {
			const at = SPEEDS.indexOf(reader.rate as (typeof SPEEDS)[number]);
			reader.setRate(SPEEDS[(at + 1) % SPEEDS.length] ?? 1);
		}
	}

	/**
	 * A passage read to its very end, with the next already there and
	 * finished: reading carries on into it, whatever "Read new passages"
	 * says, since stopping between two passages that are both there was
	 * never a pause the user asked for.
	 */
	function carryOn(turnId: string) {
		const next = readOnInto(turnId);
		if (next) {
			void tick().then(() => listen(next));
		}
	}

	/**
	 * The passage reading carries on into at the end of this one, or null:
	 * the next on the path, once it is there and finished. The reader
	 * fetches its first clips ahead by the same rule (`upNext`).
	 */
	function readOnInto(turnId: string): string | null {
		const next = passageAfter(turnId);
		// The newest while it is still being written is not there yet.
		const stillComing = session.streaming !== null && next === session.lastPassage?.id;
		return next && !stillComing && session.listening ? next : null;
	}

	// Stopped at the end of a passage, with the next not there yet: once it
	// comes and is finished, reading starts again, if the user asked for that
	// ("Read new passages"), or asked for it to be written ("Keep going");
	// otherwise its first clips are fetched, for when play is pressed.
	$effect(() => {
		const done = reader?.finishedTurn ?? null;
		const latest = session.lastPassage?.id ?? null;
		const streaming = session.streaming !== null;
		if (!(reader && done && latest) || latest === done || streaming || !session.listening) {
			return;
		}
		if (passageBefore(latest) !== done) {
			return;
		}
		if (reader.readNew || reader.keepGoing) {
			reader.finishedTurn = null;
			void tick().then(() => listen(latest));
		} else {
			// Not read until play is pressed, but ready for it: play starts at once.
			void tick().then(() => {
				const root = passageRoot(latest);
				if (root) {
					reader.prefetch(latest, root);
				}
			});
		}
	});

	// ── how it looks ─────────────────────────────────────────────────────────

	/** Every stat on a shown element, labelled with whose it is unless it is the user's. */
	const tracked = $derived(
		elements
			.filter((element) => element.shown)
			.flatMap((element) =>
				element.stats.map((stat) => ({
					key: `${element.id}.${stat.name}`,
					label: element.type === 'you' ? heading(stat.name) : `${element.name}: ${stat.name}`,
					value: stat.value,
					max: stat.kind === 'meter' ? (stat.max ?? 100) : null
				}))
			)
	);

	function heading(name: string): string {
		return name.charAt(0).toUpperCase() + name.slice(1);
	}
	/**
	 * How the story is shown: the build's choice, which the user can change
	 * from the reading settings, kept with the daydream (docs/dreams.md,
	 * "Views").
	 */
	const view = $derived(build?.presentation.view ?? 'scroll');
	const VIEW_CHOICES: { value: View; label: string }[] = [
		{ value: 'scroll', label: 'As a story' },
		{ value: 'tap', label: 'One beat at a time' },
		{ value: 'texts', label: 'As messages' },
		{ value: 'monologue', label: 'As a monologue' }
	];

	const style = $derived(build?.style);

	/** Reading settings: a view, or a writing style, which applies from the next passage. */
	function chooseView(event: WaSelectEvent) {
		const choice = event.detail.item.value ?? '';
		if (choice.startsWith('style:')) {
			const preset = choice.slice('style:'.length);
			if (isPreset(preset)) {
				void session.setStyle({ preset, notes: '', by: 'user' });
			}
			return;
		}
		const picked = VIEW_CHOICES.find((option) => option.value === choice);
		if (picked) {
			void session.setView(picked.value);
		}
	}

	const ENDED_NOTES: Record<string, string> = {
		stopped: 'Stopped before the end.',
		refused: 'Refused.',
		failed: 'Stopped part way.'
	};
</script>

<div
	class="story"

	{@attach pullToContinue}
>
	{#if build}
		<header class="title">
			<div class="title-line">
				<h2>{build.title}</h2>
				<!-- A toggle: native, because wa-button forwards no aria-pressed. -->
				<span class="switches">
					{#if onsetup}
						<button type="button" class="view-switch" onclick={() => onsetup?.()}>
							<wa-icon name="list-check" aria-hidden="true"></wa-icon>
							How it was set up
						</button>
					{/if}
					{#if reader}
						<!-- A toggle: native, because wa-button forwards no aria-pressed. -->
						<button type="button" class="view-switch" aria-pressed={session.listening} onclick={toggleListening}>
							<wa-icon name="volume-high" aria-hidden="true"></wa-icon>
							Read aloud
						</button>
					{/if}
					<!-- Reading settings: how the story is shown and written, which the build chose. -->
					<wa-dropdown placement="bottom-end" onwa-select={chooseView}>
						<wa-button slot="trigger" size="s" appearance="outlined" pill>
							<wa-icon slot="start" name="sliders" aria-hidden="true"></wa-icon>
							Reading settings
						</wa-button>
						<h3 class="menu-heading">Show it</h3>
						{#each VIEW_CHOICES as option (option.value)}
							<wa-dropdown-item type="checkbox" value={option.value} checked={view === option.value}>
								{option.label}
							</wa-dropdown-item>
						{/each}
						<h3 class="menu-heading">Write it</h3>
						{#if style?.preset === OWN_STYLE}
							<wa-dropdown-item type="checkbox" value="style:own" checked>In its own style</wa-dropdown-item>
						{/if}
						{#each STYLE_PRESETS as preset (preset.id)}
							<wa-dropdown-item
								type="checkbox"
								value={`style:${preset.id}`}
								checked={(style?.preset ?? DEFAULT_STYLE) === preset.id}
							>
								{preset.name}
							</wa-dropdown-item>
						{/each}
					</wa-dropdown>
				</span>
			</div>
			<wa-details summary="How this daydream was set up">
				<div class="setup">
					<p><strong>You asked for</strong> “{session.setup?.brief}”</p>
					{#if build.telling}<p class="telling">{build.telling}</p>{/if}
					{#if elements.length > 0}
						<div class="chips">
							{#each elements.filter((element) => element.shown) as element (element.id)}
								<wa-button size="s" appearance="outlined" onclick={() => openCard(element.id)}>
									<wa-icon
										slot="start"
										name={elementIcon(element.type)}
										style:color={colours.get(element.id)}
										aria-hidden="true"
									></wa-icon>
									{elementLabel(element)}
								</wa-button>
							{/each}
						</div>
					{/if}
					{#if (session.setup?.preferences.length ?? 0) > 0}
						<section class="this-daydream">
							<h3>Remembered for this daydream</h3>
							<ul>
								{#each session.setup?.preferences ?? [] as preference (preference.id)}
									<li>
										<span>{preference.text}</span>
										<wa-button size="s" appearance="plain" onclick={() => session.makeGeneral(preference.id)}
											>Make it general</wa-button
										>
										<wa-button size="s" appearance="plain" onclick={() => session.forget(preference.id)}
											>Forget</wa-button
										>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				</div>
			</wa-details>
		</header>
	{/if}

	{#if tracked.length > 0}
		<!-- The stats as they stand on this branch: each moved only by words that earned it. -->
		<dl class="stats">
			{#each tracked as entry (entry.key)}
				<div>
					<dt>{entry.label}</dt>
					<dd>
						{#if entry.max !== null}
							<wa-progress-bar value={Math.round((Number(entry.value) / entry.max) * 100)} label={entry.label}
							></wa-progress-bar>
							<span class="readout">{entry.value} / {entry.max}</span>
						{:else}
							<span class="readout">{Array.isArray(entry.value) ? entry.value.join(', ') : entry.value}</span>
						{/if}
					</dd>
				</div>
			{/each}
		</dl>
	{/if}

	<ol class="turns" data-view={view}>
		{#each session.path as entry, index (entry.id)}
			{#if entry.turn === null}
				<li class="unreadable">This part can't be shown on this device.</li>
			{:else if entry.turn.kind === 'input'}
				{const sent = $derived(entry.turn.text.trim())}
				{const answer = $derived(answerTo(entry.id, index))}
				<li class="you" data-reading={answer.reading ?? 'action'}>
					{#if !sent}
						<p class="quiet">Continue</p>
					{:else if answer.reading === 'direction'}
						<!-- A direction is no turn in the story: a marker, not a bubble. -->
						<p class="direction-marker">
							<wa-icon name="signs-post" aria-hidden="true"></wa-icon>
							{sent}
						</p>
					{:else if answer.yours && !showingSent.has(entry.id)}
						<p>{answer.yours}</p>
					{:else}
						<p class:sent-note={Boolean(answer.yours)}>{sent}</p>
					{/if}
					{#if sent}
						<div class="turn-note">
							{#if answer.yours}
								{showingSent.has(entry.id) ? 'What you sent' : 'Written out for you'} ·
								<!-- A toggle: native, because wa-button forwards no aria-pressed. -->
								<button
									type="button"
									class="link"
									aria-pressed={showingSent.has(entry.id)}
									onclick={() => toggleSent(entry.id)}>Show what you sent</button
								>
							{:else if answer.reading === 'direction'}
								A direction for the story
							{:else if answer.reading === 'ooc'}
								Out of character
							{:else if answer.reading === 'story'}
								Part of the story
							{/if}
							{#if answer.chosen}<span>· as you asked</span>{/if}
							{#if !session.busy}
								<wa-dropdown placement="bottom-end" onwa-select={(event: WaSelectEvent) => reread(event, entry.id)}>
									<wa-button slot="trigger" size="s" appearance="plain" pill>
										<wa-icon name="ellipsis-vertical" variant="solid" label="Read it differently"></wa-icon>
									</wa-button>
									<h3 class="menu-heading">Read it as…</h3>
									{#each READINGS.filter((reading) => reading !== (answer.reading ?? 'action')) as reading (reading)}
										<wa-dropdown-item value={reading}>{READING_CHOICES[reading]}</wa-dropdown-item>
									{/each}
								</wa-dropdown>
							{/if}
						</div>
					{/if}
				</li>
			{:else}
				{const versions = $derived(session.versions(entry.id))}
				{const passage = $derived(entry.turn)}
				<li class="passage" data-turn={entry.id} {@attach tapToListen(entry.id)}>
					<DreamMarkup
						{colours}
						source={passage.source}
						turnId={entry.id}
						{names}
						{expansions}
						filling={session.filling}
						view={entry.id === answering && view === 'tap' ? 'tap' : 'scroll'}
						inputs={inputsFor(entry.id, index)}
						{pictures}
						{designs}
						designing={session.designing}
						onref={openCard}
						onmore={(key, phrase) => expand(entry.id, key, phrase)}
					/>
					{#if ENDED_NOTES[passage.ended]}
						<p class="ended">{ENDED_NOTES[passage.ended]}</p>
					{/if}
					{#if session.chips?.turnId === entry.id}
						{const chips = $derived(session.chips)}
						<fieldset class="chips steer">
							<legend class="quiet">Or steer it</legend>
							{#each chips.options as option (option)}
								<wa-button
									size="s"
									appearance="outlined"
									disabled={session.busy}
									onclick={() => session.steerTo(entry.id, option)}>{option}</wa-button
								>
							{/each}
						</fieldset>
					{/if}
					<!-- Where one passage ends: a rule with what can be done to it in the
					     middle. Versions and Retry stay in sight; the rest is in the menu. -->
					<div class="passage-end">
						{#if passage.ended !== 'complete'}
							<wa-button size="s" appearance="outlined" disabled={session.busy} onclick={() => session.retry(entry.id)}>
								Retry
							</wa-button>
						{/if}
						<wa-dropdown placement="bottom" onwa-select={(event: WaSelectEvent) => act(event, entry.id, passage.source)}>
							<wa-button slot="trigger" size="s" appearance="plain" pill>
								<wa-icon name="ellipsis" variant="solid" label="More for this passage"></wa-icon>
							</wa-button>
							{#if reader && session.listening}
								<wa-dropdown-item value="listen">
									<wa-icon slot="icon" name="play" aria-hidden="true"></wa-icon>
									Listen
								</wa-dropdown-item>
							{/if}
							<wa-dropdown-item value="take" disabled={session.busy}>
								<wa-icon slot="icon" name="rotate" aria-hidden="true"></wa-icon>
								Another take
							</wa-dropdown-item>
							<wa-dropdown-item value="different" disabled={session.busy}>
								<wa-icon slot="icon" name="signs-post" aria-hidden="true"></wa-icon>
								Different direction
							</wa-dropdown-item>
							<wa-dropdown-item value="edit" disabled={session.busy}>
								<wa-icon slot="icon" name="pen" aria-hidden="true"></wa-icon>
								Edit
							</wa-dropdown-item>
						</wa-dropdown>
						{#if debugOn}
							<!-- Debug mode: how much of the prompt the cache served, and the request. -->
							{#if passage.usage}
								<span class="debug-note">{cachedShare(passage.usage)}% cached</span>
							{/if}
							<wa-button size="s" appearance="plain" onclick={() => showAbout(entry.id)}>
								<wa-icon name="circle-info" label="About this passage's request"></wa-icon>
							</wa-button>
						{/if}
						{#if versions.ids.length > 1}
							<span class="versions">
								<wa-button
									size="s"
									appearance="plain"
									disabled={versions.at <= 0 || session.busy}
									onclick={() => session.switchTo(versions.ids[versions.at - 1] ?? entry.id)}
								>
									<wa-icon name="chevron-left" label="Previous version"></wa-icon>
								</wa-button>
								<span>{versions.at + 1} / {versions.ids.length}</span>
								<wa-button
									size="s"
									appearance="plain"
									disabled={versions.at >= versions.ids.length - 1 || session.busy}
									onclick={() => session.switchTo(versions.ids[versions.at + 1] ?? entry.id)}
								>
									<wa-icon name="chevron-right" label="Next version"></wa-icon>
								</wa-button>
							</span>
						{/if}
					</div>
				</li>
			{/if}
		{/each}
		{#if session.streaming?.what === 'passage'}
			<li class="passage" aria-busy="true">
				{#if session.streaming.text}
					<DreamMarkup
						{colours}
						source={session.streaming.text}
						turnId={null}
						{names}
						{expansions}
						filling={session.filling}
						{designs}
						streaming
						onref={openCard}
						onmore={() => undefined}
					/>
				{:else}
					<div class="waiting" role="status" aria-label="Writing">
						<wa-skeleton effect="sheen"></wa-skeleton>
						<wa-skeleton effect="sheen"></wa-skeleton>
					</div>
				{/if}
			</li>
		{/if}
	</ol>

	{#if pulled > 0}
		<!-- Pull to continue: shown as the page is pulled past its end on a touch screen. -->
		<div class="pull" style:height={`${pulled}px`} aria-hidden="true">
			<wa-icon name={pulled >= PULL_TO_CONTINUE ? 'circle-arrow-down' : 'arrow-down'}></wa-icon>
			{pulled >= PULL_TO_CONTINUE ? 'Release to continue' : 'Pull to continue'}
		</div>
	{/if}

	<DreamNotices {session} />

	{#if session.problem}
		<wa-callout variant="warning">{session.problem}</wa-callout>
	{/if}

	<!-- The dock at the bottom (docs/dreams.md, "Your turn"): reading aloud,
	     and the user's turn, three ways: a suggestion, Continue, or their own
	     words. -->
	<div class="dock" class:stuck={stuck} data-writing={writing} bind:this={dock}>
		<!-- The dock is never more than half the screen, so the story stays in
		     sight; the turn takes what room reading aloud leaves, and what does not fit
		     scrolls, starting at its end (`startAtEnd`). -->
		<div class="dock-scroll" {@attach startAtEnd}>
			<div class="dock-inner">
				{#if session.busy}
					<div class="turn-row">
						<wa-button appearance="outlined" onclick={() => session.stop()}>
							<wa-icon slot="start" name="stop" variant="solid"></wa-icon>
							Stop
						</wa-button>
					</div>
				{:else if !writing}
					<!-- One list of chips: the suggestions, solid, as words to send; then
					     Continue and writing your own, outlined, as the other ways to take
					     the turn. Native buttons: a chip is a sentence, and wraps. -->
					<p id="dream-hold-hint" class="wa-visually-hidden">Hold it, or open its menu, to change it before sending.</p>
					<ul class="turn-chips" aria-label="Your turn">
						{#each suggested as suggestion (suggestion)}
							<li>
								<button
									type="button"
									class="chip suggestion"
									aria-describedby="dream-hold-hint"
									onclick={() => session.send(suggestion)}
									{@attach holdToChange(suggestion)}
								>
									{suggestion}
								</button>
							</li>
						{/each}
						<li>
							<button type="button" class="chip other continue" onclick={() => session.send('')}>
								<wa-icon name="forward" aria-hidden="true"></wa-icon>
								Continue daydream
							</button>
						</li>
						<li>
							<!-- A disclosure, which opens into the box. -->
							<button
								type="button"
								class="chip other write"
								aria-expanded="false"
								aria-controls="dream-turn-box"
								onclick={() => openReply()}
							>
								<wa-icon name="pen" aria-hidden="true"></wa-icon>
								Write response…
							</button>
						</li>
					</ul>
				{/if}
				<!-- Kept while put away, so a draft is restored and a suggestion can be put in it. -->
				<div id="dream-turn-box" class="reply" hidden={!writing || session.busy}>
					<DreamTextBox
						bind:this={turnBox}
						id="dream-turn"
						label="Your turn"
						max={MAX_INPUT_CHARS}
						draft={{ kind: 'dream', dreamId: session.id }}
						submitLabel="Send"
						disabled={session.busy}
						onsend={async (text) => {
							writing = false;
							await session.send(text);
							return session.problem === null;
						}}
					>
						{#snippet actions()}
							<wa-button appearance="plain" onclick={closeReply}>Cancel</wa-button>
						{/snippet}
					</DreamTextBox>
				</div>
			</div>
		</div>
		<!-- Read aloud, under the turn and outside its scroller, so it is in
		     sight however many chips there are. -->
		{#if reader && session.listening}
			<section class="player" aria-label="Reading aloud">
				<span class="speaker" style:color={reader.speakerId ? colours.get(reader.speakerId) : undefined} aria-live="polite">
					{#if reader.loading}
						Getting the voice ready…
					{:else if reader.turnId}
						{reader.speaker}
					{:else}
						Tap Listen on a passage
					{/if}
				</span>
				<span class="controls">
					<wa-button size="s" appearance="plain" disabled={reader.turnId === null} onclick={() => reader.back()}>
						<wa-icon name="backward-step" label="Back a sentence"></wa-icon>
					</wa-button>
					{#if reader.turnId && !reader.paused}
						<!-- Playing, or loading to play: pausing holds a clip still on its way. -->
						<wa-button size="s" appearance="plain" onclick={() => reader.pause()}>
							<wa-icon name="pause" label="Pause"></wa-icon>
						</wa-button>
					{:else}
						<wa-button
							size="s"
							appearance="plain"
							disabled={reader.turnId === null && session.lastPassage === null}
							onclick={() => {
								if (reader.turnId) {
									reader.resume();
								} else {
									carryOnReading();
								}
							}}
						>
							<wa-icon name="play" label="Play"></wa-icon>
						</wa-button>
					{/if}
					<wa-button size="s" appearance="plain" onclick={nextSpeed}>
						<span class="wa-visually-hidden">Speed</span>
						{reader.rate}×
					</wa-button>
				</span>
				<span class="options">
					<!-- Toggles: native, because wa-button forwards no aria-pressed. -->
					<button
						type="button"
						class="toggle"
						aria-pressed={reader.readNew}
						onclick={() => {
							reader.readNew = !reader.readNew;
						}}>{reader.readNew ? '✓ ' : ''}Read new passages</button
					>
					<button
						type="button"
						class="toggle"
						aria-pressed={reader.highlight}
						onclick={() => reader.setHighlight(!reader.highlight)}
						>{reader.highlight ? '✓ ' : ''}Highlight</button
					>
					<wa-button size="s" appearance="plain" onclick={() => {
								voicesOpen = true;
							}}>
						<wa-icon slot="start" name="user-gear" aria-hidden="true"></wa-icon>
						Voices
					</wa-button>
					<button
						type="button"
						class="toggle"
						aria-pressed={reader.keepGoing}
						onclick={() => {
							toggleKeepGoing();
						}}>{reader.keepGoing ? '✓ ' : ''}Keep going</button
					>
				</span>
				{#if reader.problem}<p class="problem">{reader.problem}</p>{/if}
			</section>
		{/if}
	</div>
	<!-- In sight exactly when the page is scrolled to its end (`watchStuck`). -->
	<div class="dock-end" aria-hidden="true" {@attach watchStuck}></div>
</div>

{#if stillListening.asking}
	<ResponsiveDialog
		label="Still listening?"
		lightDismiss={false}
		onclose={() => answerStillListening(false)}
	>
		<p>
			Keep going is writing and reading the story by itself. It pauses in {stillListening.secondsLeft}
			seconds unless you choose to keep playing.
		</p>
		{#snippet footer()}
			<wa-button appearance="outlined" onclick={() => answerStillListening(false)}>Pause</wa-button>
			<wa-button variant="brand" onclick={() => answerStillListening(true)}>Keep playing</wa-button>
		{/snippet}
	</ResponsiveDialog>
{/if}

{#if voicesOpen && voice}
	<DreamVoices
		{session}
		characters={elements.filter((element) => element.type === 'character')}
		{colours}
		serverNarrator={voice.narratorPreset}
		onclose={() => {
			voicesOpen = false;
		}}
	/>
{/if}

{#if about?.kind === 'passage' && aboutId}
	<DreamExchange
		label="About this passage's request"
		about={{
			provider: about.provider,
			model: about.model,
			usage: about.usage,
			ended: about.ended,
			request: about.request
		}}
		exchange={session.exchanges.get(aboutId)}
		extras={session.passageExtras.get(aboutId) ?? []}
		onclose={() => {
			aboutId = null;
		}}
	/>
{/if}

{#if card}
	<DreamCard
		element={card}
		colour={colours.get(card.id)}
		filling={session.filling.has(`card:${card.id}`)}
		ondraw={() => session.namesFor(card.id)}
		onrename={(name) => session.rename(card.id, name)}
		onclose={() => {
			cardId = null;
		}}
	/>
{/if}

{#if editing}
	{const target = $derived(editing)}
	<ResponsiveDialog
		label="Edit this passage"
		lightDismiss={false}
		onclose={() => {
			editing = null;
		}}
	>
		<p class="quiet">Your version is kept beside the original, and the story goes on from yours.</p>
		<DreamTextBox
			id="dream-edit"
			label="The passage"
			max={MAX_PASSAGE_CHARS}
			draft={{ kind: 'dream-edit', turnId: target.turnId }}
			initial={target.source}
			submitLabel="Keep my version"
			rows={10}
			onsend={async (text) => {
				await session.edit(target.turnId, text);
				editing = null;
				return true;
			}}
		/>
	</ResponsiveDialog>
{/if}

<style>
	.story {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: var(--wa-space-xs) var(--wa-space-m);
		margin: 0;

		dt {
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}

		dd {
			display: flex;
			align-items: center;
			gap: var(--wa-space-xs);
			margin: 0;

			wa-progress-bar {
				flex: 1;
				--track-height: 0.5rem;
			}
		}

		.readout {
			font-size: var(--wa-font-size-s);
			font-variant-numeric: tabular-nums;
		}
	}

	/* Monologue: one voice in short lines, set like a script read aloud. */
	.turns[data-view='monologue'] .passage {
		font-size: var(--wa-font-size-l);
		line-height: 1.8;
		text-align: center;
	}

	/* Texts: the story is the other side of a chat, passage by passage. */
	.turns[data-view='texts'] .passage {
		align-self: flex-start;
		max-width: 85%;
		padding: var(--wa-space-xs) var(--wa-space-m);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-raised);
	}

	.title-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-s);
	}

	.switches {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-xs);

		.menu-heading {
			margin: var(--wa-space-xs) var(--wa-space-s) var(--wa-space-3xs);
			font-size: var(--wa-font-size-xs);
			color: var(--wa-color-text-quiet);
		}
	}

	.view-switch {
		display: inline-flex;
		align-items: center;
		gap: var(--wa-space-2xs);
		padding: var(--wa-space-2xs) var(--wa-space-s);
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-pill);
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--wa-font-size-s);
		cursor: pointer;

		&[aria-pressed='true'] {
			background: var(--wa-color-brand-fill-quiet);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	/* What is being read, word by word (the reader's CSS highlight). */
	:global(::highlight(dream-reading)) {
		background-color: var(--wa-color-brand-fill-quiet);
		color: inherit;
	}

	/* Inside the dock, which is what sticks. */
	.player {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-2xs) var(--wa-space-s);
		padding: var(--wa-space-xs) var(--wa-space-s);
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-raised);

		.speaker {
			flex: 1 1 8rem;
			min-width: 0;
			font-weight: var(--wa-font-weight-semibold);
			overflow-wrap: anywhere;
		}

		.controls,
		.options {
			display: flex;
			align-items: center;
			gap: var(--wa-space-2xs);
		}

		.toggle {
			padding: var(--wa-space-3xs) var(--wa-space-xs);
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-pill);
			background: transparent;
			color: inherit;
			font: inherit;
			font-size: var(--wa-font-size-xs);
			cursor: pointer;

			&[aria-pressed='true'] {
				background: var(--wa-color-brand-fill-quiet);
			}

			&:focus-visible {
				outline: var(--wa-focus-ring);
			}
		}

		.problem {
			flex-basis: 100%;
			margin: 0;
			color: var(--wa-color-text-quiet);
			font-size: var(--wa-font-size-s);
		}
	}

	.title h2 {
		margin: 0 0 var(--wa-space-xs);
	}

	.setup {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);

		p {
			margin: 0;
		}
	}

	.this-daydream {
		h3 {
			margin: 0 0 var(--wa-space-2xs);
			font-size: var(--wa-font-size-s);
		}

		ul {
			margin: 0;
			padding: 0;
			list-style: none;
		}

		li {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--wa-space-2xs);

			span {
				flex: 1 1 12rem;
			}
		}
	}

	.telling {
		color: var(--wa-color-text-quiet);
		white-space: pre-line;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-2xs);
	}

	.steer {
		align-items: center;
		margin-inline: 0;
		padding: 0;
		border: 0;
		margin-top: var(--wa-space-xs);
		font-family: var(--wa-font-family-body);
	}

	/* The passages' own area. Blocks give a part of it a style of its own. */
	.turns {
		padding: var(--wa-space-m);
		border-radius: var(--wa-border-radius-l);
		margin: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-l);
	}

	.you {
		align-self: flex-end;
		max-width: 85%;
		padding: var(--wa-space-xs) var(--wa-space-m);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-brand-fill-quiet);

		p {
			margin: 0;
			white-space: pre-line;
		}

		/* What was sent, shown beside its written-out turn: a note, never mistaken for it. */
		.sent-note {
			font-style: italic;
			border-left: 2px dashed var(--wa-color-brand-border-normal);
			padding-left: var(--wa-space-xs);
		}

		.turn-note {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: flex-end;
			gap: var(--wa-space-3xs);
			margin-top: var(--wa-space-3xs);
			font-size: var(--wa-font-size-xs);
			color: var(--wa-color-text-quiet);
		}

		.link {
			all: unset;
			cursor: pointer;
			text-decoration: underline;

			&:focus-visible {
				outline: var(--wa-focus-ring);
			}
		}

		.menu-heading {
			margin: var(--wa-space-xs) var(--wa-space-s) var(--wa-space-3xs);
			font-size: var(--wa-font-size-xs);
			color: var(--wa-color-text-quiet);
		}
	}

	/* A direction is no turn in the story, so not a bubble. */
	.you[data-reading='direction'] {
		align-self: center;
		background: transparent;

		.direction-marker {
			display: flex;
			align-items: center;
			gap: var(--wa-space-xs);
			font-style: italic;
			color: var(--wa-color-text-quiet);
		}
	}

	.quiet,
	.ended,
	.unreadable {
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}

	.passage-end {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--wa-space-2xs);
		margin-top: var(--wa-space-s);

		&::before,
		&::after {
			content: '';
			flex: 1 1 2rem;
			border-top: 1px solid var(--wa-color-surface-border);
		}
	}

	.versions {
		display: inline-flex;
		align-items: center;
		gap: var(--wa-space-2xs);
		font-size: var(--wa-font-size-s);
	}

	.waiting {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
	}

	/* Stuck to the bottom of what scrolls while the story runs on under it,
	   and sitting at the story's end once scrolled there, as the kink list's
	   pinned bar does at the top. */
	.dock {
		position: sticky;
		bottom: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
		max-height: 50dvh;
		box-sizing: border-box;
		padding-block: var(--wa-space-s);

		/* The background it takes only while stuck, from one edge of the page
		   to the other rather than the column's width, so the story is hidden
		   under it right across. A border-image outset reaches that far without
		   widening what the page scrolls over, which a wide box would. Faded in
		   quickly. */
		&::before {
			content: '';
			position: absolute;
			inset: 0;
			z-index: -1;
			border-image-source: linear-gradient(var(--wa-color-surface-lowered) 0 0);
			border-image-slice: 0 fill;
			border-image-outset: 0 100vw;
			opacity: 0;
			transition: opacity 150ms ease-out;
			pointer-events: none;
		}

		&.stuck::before {
			opacity: 1;
		}

		@media (prefers-reduced-motion: reduce) {
			&::before {
				transition: none;
			}
		}

		/* A chip is a sentence, not a control's label: Web Awesome's native
		   button styles (one line at a fixed height, centred) are undone. */
		.chip {
			display: inline-flex;
			align-items: center;
			gap: var(--wa-space-xs);
			max-width: 100%;
			height: auto;
			padding: var(--wa-space-2xs) var(--wa-space-m);
			border: 1px solid transparent;
			border-radius: var(--wa-border-radius-pill);
			font: inherit;
			font-weight: normal;
			white-space: normal;
			overflow-wrap: anywhere;
			text-align: center;
			cursor: pointer;

			&:focus-visible {
				outline: var(--wa-focus-ring);
			}
		}

		/* Words to send as they are: solid. Held, it is changed first, so a long
		   press must not select its words or open the browser's own menu. */
		.suggestion {
			-webkit-touch-callout: none;
			user-select: none;
			background: var(--wa-color-brand-fill-quiet);
			color: var(--wa-color-text-normal);

			&:hover {
				background: var(--wa-color-brand-fill-normal);
			}
		}

		/* The other ways to take the turn: outlined, with an icon. */
		.other {
			border-color: var(--wa-color-brand-border-normal);
			background: transparent;
			color: var(--wa-color-brand-on-quiet);

			&:hover {
				background: var(--wa-color-brand-fill-quiet);
			}
		}
	}

	.turn-chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--wa-space-xs);
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			max-width: 100%;
		}
	}

	/* The button and the box it opens into are one thing to the view
	   transition, so the one grows into the other. */
	.write,
	.reply {
		view-transition-name: dream-reply;
	}

	.turn-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--wa-space-xs);
	}

	/* The room the dock has left beside reading aloud. The scroller is inside
	   the sticky box rather than the box itself: a scroller clips what is
	   drawn beyond it, and the stuck background reaches right across the page. */
	.dock-scroll {
		flex: 0 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	/* A little room inside the scroller, so a focus ring is not clipped. */
	.dock-inner {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
		padding: var(--wa-space-3xs);
	}

	/* Zero height, only where it is matters (`watchStuck`). */
	.dock-end {
		block-size: 0;
	}

	.pull {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: var(--wa-space-xs);
		overflow: hidden;
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}

	.debug-note {
		font-family: var(--wa-font-family-code);
		font-size: var(--wa-font-size-xs);
		color: var(--wa-color-text-quiet);
	}
</style>
