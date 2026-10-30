/**
 * One daydream on its page (docs/dreams.md, "The setup page" and
 * "Playing"): its opened setup and story, the steps of setting it up, and
 * every action on a passage. The page renders this; this does the work.
 *
 * BROWSER ONLY: it seals and opens through `./api`.
 *
 * Nothing is replaced. A retry, another take or an edit is a new turn beside
 * the old one, and moving between them moves `activeTurnId`, so the
 * previous version is always a tap away.
 */

import {
	buildRequestFor,
	LEANING_DROP,
	passageRequestFor,
	readRequestFor,
	recentFrom,
	type Worded,
	wordPreferences
} from '$lib/dream/assemble';
import { parseBuild } from '$lib/dream/build';
import { designsWanted, LAID_OUT_KINDS, MAX_DESIGNS, parseDesign } from '$lib/dream/designs';
import { type DreamElement, parseElements } from '$lib/dream/elements';
import { turnInputs } from '$lib/dream/fields';
import { asksForResearch } from '$lib/dream/links';
import { findTag, findTags, parseMarkup } from '$lib/dream/markup';
import { drawNudges } from '$lib/dream/nudges';
import { pickDirection } from '$lib/dream/pick';
import { picturePrompt } from '$lib/dream/pictures';
import {
	preferenceFromAnswer,
	preferenceFromFooter,
	samePreference,
	withoutPreference,
	withPreference
} from '$lib/dream/preferences';
import { cryptoRandom } from '$lib/dream/random';
import { parseBriefReading } from '$lib/dream/reading';
import type { Reading } from '$lib/dream/readings';
import {
	codePick,
	type SetupStep,
	setupStep,
	userPick,
	withAmendment,
	withAnswer,
	withEditsApplied,
	withElementChange,
	withoutEdit,
	withReading
} from '$lib/dream/setup-flow';
import type { LiveStep, ResearchMode } from '$lib/dream/setup-progress';
import {
	elementsAt,
	expansionsAt,
	footerOf,
	isStuck,
	memoryFor,
	needsFilling,
	type PathTurn,
	repeatedAt,
	sceneToSummarise,
	type UserTurn,
	userTurnOf
} from '$lib/dream/story';
import { indexTree, latestLeafUnder, versionsOf } from '$lib/dream/tree';
import type { DreamTreeNodeView, DreamView } from '$lib/dream/views';
import {
	type DreamDetail,
	type DreamPassageTurn,
	type DreamPreference,
	type DreamSetup,
	type DreamSetupBuild,
	type DreamSummary,
	type DreamTrailStep,
	MAX_TRAIL,
	type PassageRequest as PassageKind
} from '$lib/sealed-kinds/dreams';
import {
	appendTurn,
	DreamRequestError,
	designBlock,
	drawNames,
	fill,
	type Lookup,
	listDirections,
	listDreams,
	makePicture,
	openDetail,
	openPicture,
	openSetup,
	openSummary,
	openTurn,
	readBranch,
	readPreferences,
	type StreamResult,
	saveDetail,
	savePreferences,
	saveSetup,
	saveSummary,
	setActiveTurn,
	storePicture,
	streamReply
} from './api';

export type Streaming = {
	what: 'read' | 'build' | 'passage';
	text: string;
	/** The model's thinking so far, shown while it works; never kept. */
	thinking?: string;
	/** For a passage: the turn it will follow, and what asked for it. */
	parentId?: string | null;
	request?: PassageKind;
};

type Opened<T> = { turnId: string; value: T };

/** A setup with one more step on its trail, oldest dropped past the cap (docs/dreams.md, "The setup page"). */
function withStep(
	setup: DreamSetup,
	step: Omit<DreamTrailStep, 'id'> & { id?: string }
): DreamSetup {
	const entry = { ...step, id: step.id ?? crypto.randomUUID().slice(0, 12) };
	// The trail as kept: one worked out for an older setup (`trailOf`) would
	// already hold the step being added.
	return { ...setup, trail: [...(setup.trail ?? []), entry].slice(-MAX_TRAIL) };
}

/** What really went wrong, for debug mode: the server's detail, or the page's own error. */
function detailOf(cause: unknown): string | null {
	if (cause instanceof DreamRequestError) {
		return cause.detail;
	}
	return cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
}

/** A request to the model and what came back, for debug mode. */
export type Exchange = {
	request: unknown;
	reply: string;
	thinking: string;
	provider: string;
	usage?: StreamResult['usage'];
	latencyMs?: number;
};

/** How many of the user's other daydreams are read for recent directions and names. */
const RECENT_DREAMS = 20;

/** Seeds for code's draws: random in play, fixed by the simulated player. */
export type SessionOptions = {
	/** Seeds for code's draws: random in play, fixed by tests. */
	seed?: () => number;
	/** For a "usually" preference's coin: random in play. */
	random?: () => number;
	/** Whose preferences these are: the record is sealed to their id. */
	userId: string;
	/** The user's own preferences, as stored, and their revision (null before any). */
	general: { revision: number | null; preferences: DreamPreference[] };
	/** How this server researches a brief, which decides the setup's first steps. */
	research?: ResearchMode;
};

/**
 * Something the page tells the user about, with what they can do about it
 * (docs/dreams.md, "Preferences"): a preference just saved, which can be
 * made general or undone, or new telling notes the story proposes, which
 * apply only if accepted.
 */
type DreamNoticeSaved = {
	id: string;
	kind: 'saved';
	preference: DreamPreference;
	scope: 'story' | 'general';
};
type DreamNoticeTelling = { id: string; kind: 'telling'; text: string };
export type DreamNotice = DreamNoticeSaved | DreamNoticeTelling;

/** What asked for a passage, from what it is written after. */
function requestFor(
	take: string | null,
	pending: UserTurn | null,
	path: readonly PathTurn[]
): PassageKind {
	if (take) {
		return 'take';
	}
	if (pending === null) {
		return 'opening';
	}
	// Continue straight after a passage, rather than after the user's turn.
	return pending.kind === 'continue' && path.at(-1)?.turn?.kind === 'passage' ? 'continue' : 'next';
}

export class DreamSession {
	readonly id: string;
	revision = $state(0);
	setup = $state<DreamSetup | null>(null);
	/** The tree's shape, oldest first. */
	tree = $state<DreamTreeNodeView[]>([]);
	/** The branch being read, opened. */
	path = $state<PathTurn[]>([]);
	details = $state<Opened<DreamDetail>[]>([]);
	summaries = $state<Opened<DreamSummary>[]>([]);
	activeTurnId = $state<string | null>(null);
	streaming = $state<Streaming | null>(null);
	/** What went wrong with the last thing asked for, worded for the reader. */
	problem = $state<string | null>(null);
	/** Cards being filled in and `<more>`s being expanded, by key. */
	filling = $state<Set<string>>(new Set());
	/**
	 * What the user has set in the passage being answered: cycling choices by
	 * id, and field values by `fieldKey`. Sent with their turn, then cleared.
	 */
	choices = $state<Record<string, string>>({});
	values = $state<Record<string, string>>({});
	/**
	 * The directions "Different direction" did not take, as chips under the
	 * passage it wrote. Kept while the page is open; not stored.
	 */
	chips = $state<{ turnId: string; options: string[] } | null>(null);
	/** Whether the setup or the story could not be opened on this device. */
	unreadable = $state(false);

	/** The user's own preferences, every daydream's. */
	general = $state<DreamPreference[]>([]);
	#generalRevision: number | null;
	readonly #userId: string;
	readonly #research: ResearchMode;
	/** The request being made now, for the setup page's steps. */
	liveStep = $state<LiveStep | null>(null);
	/**
	 * Steps taken on this page that are kept with the setup once the request
	 * they came in is: a separate research step, until its reading is done.
	 */
	pendingTrail = $state<DreamTrailStep[]>([]);
	/**
	 * Pages step 1 read and searches it made for the brief, each with how it
	 * went, as they happen; kept with the reading once it is saved.
	 */
	lookups = $state<Lookup[]>([]);
	/** What a separate research step found, as soon as it has (`research` event). */
	researched = $state<string | null>(null);
	/**
	 * Whether the user is listening to this daydream read aloud, which asks
	 * passages for delivery cues and sounds. For this page only.
	 */
	listening = $state(false);
	/** What really went wrong with `problem`, for debug mode. */
	problemDetail = $state<string | null>(null);
	/**
	 * Each request as it went to the model, with its reply, by turn for a
	 * passage and by step for the setup, for debug mode: only an account that
	 * can turn it on is sent them, and they are kept for this page only.
	 */
	exchanges = $state(new Map<string, Exchange>());
	/** Notices for the user, newest last. */
	notices = $state<DreamNotice[]>([]);
	readonly #seed: () => number;
	readonly #random: () => number;
	/**
	 * Whether each "usually" preference is in play on this page, decided once,
	 * so they do not flicker in and out between requests (`LEANING_DROP`).
	 */
	readonly #leanings = new Map<string, boolean>();
	#abort: AbortController | null = null;
	/** The build a change is to, kept while the page is open (not stored). */
	#previousBuild: DreamSetupBuild | null = null;

	constructor(id: string, options: SessionOptions) {
		this.id = id;
		this.#seed = options.seed ?? (() => Math.floor(cryptoRandom() * 2 ** 31));
		this.#random = options.random ?? cryptoRandom;
		this.#userId = options.userId;
		this.#research = options.research ?? 'none';
		this.general = options.general.preferences;
		this.#generalRevision = options.general.revision;
	}

	/** The limits and preferences in play, as the prompts take them. */
	get worded(): Worded {
		const kept = (entry: DreamPreference) => {
			if (entry.firmness !== 'leaning') {
				return true;
			}
			let keep = this.#leanings.get(entry.id);
			if (keep === undefined) {
				keep = this.#random() >= LEANING_DROP;
				this.#leanings.set(entry.id, keep);
			}
			return keep;
		};
		return wordPreferences(this.general.filter(kept), (this.setup?.preferences ?? []).filter(kept));
	}

	// ── what the page reads ───────────────────────────────────────────────────

	get step(): SetupStep | null {
		return this.setup ? setupStep(this.setup) : null;
	}

	get busy(): boolean {
		return this.streaming !== null;
	}

	get elements() {
		return elementsAt(
			this.setup?.build?.elements ?? [],
			this.path,
			this.details.map(({ turnId, value }) => ({ turnId, detail: value }))
		);
	}

	get expansions(): Map<string, string> {
		return expansionsAt(
			this.path,
			this.details.map(({ turnId, value }) => ({ turnId, detail: value }))
		);
	}

	/** A passage's versions, oldest first, and which one this is. */
	versions(turnId: string): { ids: string[]; at: number } {
		const ids = versionsOf(indexTree(this.tree), turnId).map((node) => node.id);
		return { ids, at: ids.indexOf(turnId) };
	}

	get lastPassage(): (PathTurn & { turn: DreamPassageTurn }) | null {
		const last = this.path.at(-1);
		return last?.turn?.kind === 'passage' ? (last as PathTurn & { turn: DreamPassageTurn }) : null;
	}

	// ── loading ───────────────────────────────────────────────────────────────

	async load(view: DreamView): Promise<void> {
		this.revision = view.revision;
		this.tree = view.tree;
		this.activeTurnId = view.activeTurnId;
		const setup = await openSetup(view.setup);
		if (!setup) {
			this.unreadable = true;
			return;
		}
		this.setup = setup;
		this.lookups = setup.reading?.lookups ?? [];
		await this.#openBranch(view);
	}

	async #openBranch(branch: Pick<DreamView, 'path' | 'details' | 'summaries'>) {
		const [path, details, summaries] = await Promise.all([
			Promise.all(
				branch.path.map(async (turn) => ({ id: turn.id, turn: await openTurn(turn.sealed) }))
			),
			Promise.all(
				branch.details.map(async (note) => ({
					turnId: note.turnId,
					value: await openDetail(note.sealed)
				}))
			),
			Promise.all(
				branch.summaries.map(async (note) => ({
					turnId: note.turnId,
					value: await openSummary(note.sealed)
				}))
			)
		]);
		this.path = path;
		this.details = details.filter((entry): entry is Opened<DreamDetail> => entry.value !== null);
		this.summaries = summaries.filter(
			(entry): entry is Opened<DreamSummary> => entry.value !== null
		);
	}

	// ── doing things, with one way of failing ─────────────────────────────────

	async #attempt(work: (signal: AbortSignal) => Promise<void>): Promise<void> {
		this.#abort?.abort();
		const abort = new AbortController();
		this.#abort = abort;
		this.problem = null;
		this.problemDetail = null;
		try {
			await work(abort.signal);
		} catch (cause) {
			if (!abort.signal.aborted) {
				this.problem =
					cause instanceof DreamRequestError
						? cause.message
						: 'Something went wrong. Please try again.';
				// Shown only in debug mode: what the server said, for an account
				// that can turn it on, or the error this page met itself.
				this.problemDetail = detailOf(cause);
			}
		} finally {
			if (this.#abort === abort) {
				this.#abort = null;
				this.streaming = null;
				this.liveStep = null;
			}
		}
	}

	/** Stops whatever is being written. What arrived of a passage is kept as a version. */
	stop(): void {
		this.#abort?.abort();
	}

	async #saveSetup(setup: DreamSetup): Promise<void> {
		this.revision = await saveSetup(this.id, setup, this.revision);
		this.setup = setup;
	}

	// ── setting up ────────────────────────────────────────────────────────────

	/** Runs the setup's steps from wherever it is until it needs the user or is ready. */
	runSetup(): Promise<void> {
		return this.#attempt(async (signal) => {
			for (;;) {
				const { setup } = this;
				const step = setup ? setupStep(setup) : null;
				if (!setup || step === 'ask' || step === 'pick') {
					return;
				}
				if (step === 'read') {
					await this.#read(setup, signal);
				} else if (step === 'build' && !setup.chosen) {
					const picked = codePick(setup, this.#seed());
					if (picked === setup) {
						// Nothing to pick from: never loop on it.
						throw new DreamRequestError(
							'The brief could not be read just now. Try again, or change it.',
							502
						);
					}
					await this.#saveSetup(withStep(picked, { kind: 'pick', by: 'code' }));
				} else if (step === 'build') {
					await this.#build(setup, signal);
				} else {
					if (this.path.length === 0) {
						// Built, but the opening was never kept: write it again.
						await this.#passage({ parentId: null, pending: null, take: null, signal });
					}
					return;
				}
			}
		});
	}

	async #read(setup: DreamSetup, signal: AbortSignal) {
		this.streaming = { what: 'read', text: '' };
		this.lookups = [];
		this.researched = null;
		this.pendingTrail = [];
		let researched: string | null = null;
		const readId = crypto.randomUUID().slice(0, 12);
		// A research model works first, as a request of its own: its step comes
		// before the reading's, with what it looked up under it.
		const separate = this.#research === 'model' && asksForResearch(setup.brief);
		const researchId = crypto.randomUUID().slice(0, 12);
		let researchRequest: unknown = null;
		this.liveStep = separate ? { id: researchId, kind: 'research' } : { id: readId, kind: 'read' };
		const researchDone = () => {
			if (this.liveStep?.kind === 'research') {
				this.pendingTrail = [{ id: researchId, kind: 'research', lookups: this.lookups }];
				this.lookups = [];
				this.liveStep = { id: readId, kind: 'read' };
				if (researchRequest !== null) {
					this.#record(
						`setup:${researchId}`,
						researchRequest,
						{
							text: researched ?? '',
							ended: 'complete',
							model: '',
							provider: ''
						},
						''
					);
				}
			}
		};
		const watch = this.#watch({
			onResearchRequest: (request) => {
				researchRequest = request;
			},
			onFirstText: researchDone
		});
		const reply = await streamReply(
			'read',
			readRequestFor(setup, this.worded, drawNudges(cryptoRandom), {
				...(await this.#recent(setup)),
				directions: [...this.#notThese, ...(await this.#recent(setup)).directions].slice(0, 20)
			}),
			{
				signal,
				...watch.options,
				onLookup: (lookup) => {
					this.lookups = [...this.lookups, lookup];
				},
				onResearch: (text) => {
					researched = text;
					this.researched = text;
					researchDone();
				}
			}
		);
		if (reply.ended !== 'complete' || parseBriefReading(reply.text).directions.length === 0) {
			throw new DreamRequestError(
				'The brief could not be read just now. Try again, or change it.',
				502
			);
		}
		researchDone();
		watch.keep(`setup:${readId}`, reply);
		const reading = parseBriefReading(reply.text);
		// A separate research step's findings are kept as written: the reading
		// was told not to repeat them (docs/dreams.md, "Research").
		const lookups = [...this.pendingTrail.flatMap((step) => step.lookups ?? []), ...this.lookups];
		let next = withReading(
			setup,
			researched ? { ...reading, research: { needed: true, text: researched } } : reading,
			lookups
		);
		for (const step of this.pendingTrail) {
			next = withStep(next, step);
		}
		next = withStep(next, { id: readId, kind: 'read', lookups: this.lookups });
		await this.#saveSetup(next);
		this.pendingTrail = [];
		this.liveStep = null;
	}

	async #build(setup: DreamSetup, signal: AbortSignal) {
		this.streaming = { what: 'build', text: '' };
		const buildId = crypto.randomUUID().slice(0, 12);
		this.liveStep = { id: buildId, kind: 'build' };
		const watch = this.#watch();
		const reply = await streamReply(
			'build',
			buildRequestFor(setup, this.worded, this.#previousBuild, await this.#recent(setup)),
			{ signal, ...watch.options }
		);
		watch.keep(`setup:${buildId}`, reply);
		const { passage, ...build } = parseBuild(reply.text);
		if (!(build.title && passage) || reply.ended === 'refused') {
			throw new DreamRequestError(
				'The daydream could not be written just now. Try again, or change the brief.',
				502
			);
		}
		this.#previousBuild = null;
		// Shown to the user before it is played: the summary waits on Start
		// (docs/dreams.md, "The setup page").
		await this.#saveSetup(
			withStep({ ...setup, build, awaitingStart: true }, { id: buildId, kind: 'build' })
		);
		this.liveStep = null;
		const opening = await this.#keepPassage({
			parentId: null,
			request: 'opening',
			source: passage,
			ended: reply.ended === 'complete' ? 'complete' : reply.ended,
			model: reply.model,
			provider: reply.provider,
			...(reply.usage ? { usage: { ...reply.usage, latencyMs: reply.latencyMs } } : {})
		});
		watch.keep(opening, reply);
	}

	#recentSetups: Promise<DreamSetup[]> | null = null;

	/**
	 * What the user's other recent daydreams went with (`recentFrom`), opened
	 * here from their sealed setups: the server cannot read them. Read once
	 * per page; a failure only means nothing is avoided.
	 */
	async #recent(setup: DreamSetup) {
		this.#recentSetups ??= listDreams()
			.then((dreams) =>
				Promise.all(
					dreams
						.filter((dream) => dream.id !== this.id)
						.slice(0, RECENT_DREAMS)
						.map((dream) => openSetup(dream.setup))
				)
			)
			.then((setups) => setups.filter((other): other is DreamSetup => other !== null))
			.catch(() => []);
		return recentFrom(await this.#recentSetups, setup.brief);
	}

	#streamed(text: string) {
		if (this.streaming) {
			this.streaming = { ...this.streaming, text };
		}
	}

	/**
	 * The callbacks every streamed request shares (its words and thinking as
	 * they come, and the request itself for debug mode), and `keep`, which
	 * files the request with its reply under a key once it has one.
	 */
	#watch(hooks: { onResearchRequest?: (request: unknown) => void; onFirstText?: () => void } = {}) {
		let request: unknown = null;
		let thinking = '';
		return {
			options: {
				onText: (text: string) => {
					hooks.onFirstText?.();
					this.#streamed(text);
				},
				onThinking: (text: string) => {
					thinking = text;
					this.#thought(text);
				},
				onExchange: (sent: unknown, step?: 'research') => {
					if (step === 'research') {
						hooks.onResearchRequest?.(sent);
					} else {
						request = sent;
					}
				}
			},
			keep: (key: string, reply: StreamResult) => this.#record(key, request, reply, thinking)
		};
	}

	/** Keeps a request and its reply for debug mode, when the server sent the request. */
	#record(key: string, request: unknown, reply: StreamResult, thinking: string) {
		if (request === null) {
			return;
		}
		const next = new Map(this.exchanges);
		next.set(key, {
			request,
			reply: reply.text,
			thinking,
			provider: reply.provider,
			...(reply.usage ? { usage: reply.usage } : {}),
			...(reply.latencyMs === undefined ? {} : { latencyMs: reply.latencyMs })
		});
		this.exchanges = next;
	}

	#thought(thinking: string) {
		if (this.streaming) {
			this.streaming = { ...this.streaming, thinking };
		}
	}

	/**
	 * Answers step 1's question; it reads the brief again with the answer.
	 * Remembered for this daydream (the default) or for every one, or not.
	 */
	answer(text: string, remember: 'none' | 'story' | 'general' = 'story'): Promise<void> {
		const { setup } = this;
		const question = setup?.reading?.ask?.text;
		if (!(setup && question)) {
			return Promise.resolve();
		}
		return this.#attempt(async () => {
			let next = withStep(withAnswer(setup, text), { kind: 'answer' });
			if (remember !== 'none') {
				const preference = preferenceFromAnswer(question, text, this.#random);
				if (remember === 'story') {
					next = { ...next, preferences: withPreference(next.preferences, preference) };
				} else {
					await this.#saveGeneral(withPreference(this.general, preference));
				}
				this.#notify({ kind: 'saved', preference, scope: remember });
			}
			await this.#saveSetup(next);
		}).then(() => this.runSetup());
	}

	// ── preferences ───────────────────────────────────────────────────────────

	#notify(notice: Omit<DreamNoticeSaved, 'id'> | Omit<DreamNoticeTelling, 'id'>) {
		this.notices = [...this.notices, { ...notice, id: crypto.randomUUID() } as DreamNotice];
	}

	dismiss(noticeId: string): void {
		this.notices = this.notices.filter((notice) => notice.id !== noticeId);
	}

	/**
	 * Saves the user's own preferences, compare-and-swap. When another device
	 * saved first, nothing is merged (a merge would bring back a preference
	 * just removed): the stored ones are shown, and the user asked to try
	 * again.
	 */
	async #saveGeneral(preferences: DreamPreference[]): Promise<void> {
		try {
			this.#generalRevision = await savePreferences(
				this.#userId,
				{ preferences },
				this.#generalRevision
			);
			this.general = preferences;
		} catch (cause) {
			if (cause instanceof DreamRequestError && cause.status === 409) {
				const stored = await readPreferences();
				this.#generalRevision = stored.revision;
				this.general = stored.preferences.preferences;
			}
			throw cause;
		}
	}

	/** Keeps a story preference for every daydream instead. */
	makeGeneral(preferenceId: string): Promise<void> {
		const { setup } = this;
		const preference =
			setup?.preferences.find((entry) => entry.id === preferenceId) ??
			this.notices
				.map((notice) => (notice.kind === 'saved' ? notice.preference : null))
				.find((entry) => entry?.id === preferenceId);
		if (!(setup && preference)) {
			return Promise.resolve();
		}
		return this.#attempt(async () => {
			await this.#saveGeneral(withPreference(this.general, preference));
			await this.#saveSetup({
				...setup,
				preferences: withoutPreference(setup.preferences, preferenceId)
			});
			this.notices = this.notices.map((notice) =>
				notice.kind === 'saved' && notice.preference.id === preferenceId
					? { ...notice, scope: 'general' }
					: notice
			);
		});
	}

	/** Forgets a preference, from this daydream or every one. */
	forget(preferenceId: string): Promise<void> {
		const { setup } = this;
		return this.#attempt(async () => {
			if (this.general.some((entry) => entry.id === preferenceId)) {
				await this.#saveGeneral(withoutPreference(this.general, preferenceId));
			}
			if (setup?.preferences.some((entry) => entry.id === preferenceId)) {
				await this.#saveSetup({
					...setup,
					preferences: withoutPreference(setup.preferences, preferenceId)
				});
			}
			this.notices = this.notices.filter(
				(notice) => !(notice.kind === 'saved' && notice.preference.id === preferenceId)
			);
		});
	}

	/** The story's proposed telling notes, applied only now that the user accepted them. */
	acceptTelling(noticeId: string): Promise<void> {
		const notice = this.notices.find((entry) => entry.id === noticeId);
		const { setup } = this;
		const build = setup?.build;
		if (!(notice?.kind === 'telling' && setup && build)) {
			return Promise.resolve();
		}
		const telling = notice.text;
		return this.#attempt(async () => {
			await this.#saveSetup({ ...setup, build: { ...build, telling } });
			this.dismiss(noticeId);
		});
	}

	/**
	 * What a new passage's footer says about the user: a preference the model
	 * noticed, kept for this story only and shown so it can be made general or
	 * undone; and new telling notes, shown to be accepted or not.
	 */
	async #fromFooter(source: string): Promise<void> {
		const { setup } = this;
		if (!setup?.build) {
			return;
		}
		let { preferences } = setup;
		for (const line of footerOf(source).entries) {
			if (line.kind === 'pref') {
				const preference = preferenceFromFooter(line, this.#random);
				const before = preferences.length;
				preferences = withPreference(preferences, preference);
				const known = this.general.some((entry) => samePreference(entry.text, preference.text));
				if (preferences.length > before && !known) {
					this.#notify({ kind: 'saved', preference, scope: 'story' });
				} else {
					preferences = preferences.slice(0, before);
				}
			} else if (line.kind === 'telling' && line.telling !== setup.build.telling) {
				this.#notify({ kind: 'telling', text: line.telling });
			}
		}
		if (preferences !== setup.preferences) {
			await this.#saveSetup({ ...setup, preferences });
		}
	}

	/** Chooses a direction, stopping a build of another. */
	choose(directionId: string): Promise<void> {
		const { setup } = this;
		if (!setup) {
			return Promise.resolve();
		}
		this.stop();
		return this.#attempt(() =>
			this.#saveSetup(
				withStep(userPick(setup, directionId, this.#seed()), { kind: 'pick', by: 'user' })
			)
		).then(() => this.runSetup());
	}

	/** "Surprise me" when the brief asked to choose: code's pick, as if it had not. */
	surprise(): Promise<void> {
		const { setup } = this;
		if (!setup) {
			return Promise.resolve();
		}
		this.stop();
		return this.#attempt(() =>
			this.#saveSetup(withStep(codePick(setup, this.#seed()), { kind: 'pick', by: 'code' }))
		).then(() => this.runSetup());
	}

	/** Ideas already tried on this page, by direction text, for "Try another idea". */
	#tried = new Set<string>();
	/** Ideas to mark "not these" when step 1 reads the brief again. */
	#notThese: string[] = [];

	/**
	 * "Try another idea": picks again from the ideas not yet tried. When every
	 * one has been, step 1 reads the brief again with them all marked "not
	 * these" (docs/dreams.md, "Picking").
	 */
	tryAnother(): Promise<void> {
		const { setup } = this;
		const reading = setup?.reading;
		if (!(setup && reading)) {
			return Promise.resolve();
		}
		this.stop();
		if (setup.chosen) {
			this.#tried.add(setup.chosen.directionId);
		}
		const next = codePick(setup, this.#seed(), this.#tried);
		if (next !== setup) {
			return this.#attempt(() =>
				this.#saveSetup(withStep(next, { kind: 'pick', by: 'code' }))
			).then(() => this.runSetup());
		}
		this.#notThese = [...this.#notThese, ...reading.directions.map((direction) => direction.text)];
		this.#tried = new Set();
		return this.#attempt(() =>
			this.#saveSetup({ ...setup, reading: null, chosen: null, build: null })
		).then(() => this.runSetup());
	}

	/** Start: the daydream is played from its opening (docs/dreams.md, "The setup page"). */
	start(): Promise<void> {
		const { setup } = this;
		if (!setup?.awaitingStart) {
			return Promise.resolve();
		}
		return this.#attempt(() => this.#saveSetup({ ...setup, awaitingStart: false }));
	}

	/** Kinds of block being designed, for the page to show they are on their way. */
	designing = $state(new Set<string>());

	/**
	 * Blocks a passage described that no layout covers are designed
	 * (docs/dreams.md, "Designed blocks"), two a passage at most, in the
	 * background: until a design comes the block is the generic card. A
	 * design that fails its check is not kept, and is asked for again the
	 * next time the kind is described.
	 */
	async #designFrom(source: string): Promise<void> {
		const { setup } = this;
		if (!setup?.build) {
			return;
		}
		const known = new Set([
			...LAID_OUT_KINDS,
			...(setup.designs ?? []).map((design) => design.kind),
			...this.designing
		]);
		const tags = findTags(parseMarkup(source, { final: true }), 'block');
		const wanted = designsWanted(tags, known).slice(0, 2);
		for (const request of wanted) {
			this.designing = new Set([...this.designing, request.kind]);
			try {
				const reply = await designBlock({ ...request, theme: setup.build.presentation.theme });
				const design = parseDesign(reply, request);
				const latest = this.setup;
				if (design && latest) {
					const designs = [
						...(latest.designs ?? []).filter((kept) => kept.kind !== design.kind),
						design
					];
					await this.#saveSetup({ ...latest, designs: designs.slice(-MAX_DESIGNS) });
				}
			} finally {
				const left = new Set(this.designing);
				left.delete(request.kind);
				this.designing = left;
			}
		}
	}

	/** Saves an element changed by hand on the setup page; Update has the build follow it. */
	async editElement(changed: DreamElement): Promise<boolean> {
		const { setup } = this;
		if (!setup?.build) {
			return false;
		}
		await this.#attempt(() => this.#saveSetup(withElementChange(setup, changed)));
		return this.problem === null;
	}

	/** Undoes a change made by hand, and any later one to the same element. */
	undoEdit(index: number): Promise<void> {
		const { setup } = this;
		if (!setup) {
			return Promise.resolve();
		}
		return this.#attempt(() => this.#saveSetup(withoutEdit(setup, index)));
	}

	/** Update: the build follows what was changed by hand, and waits on Start again. */
	applyEdits(): Promise<void> {
		const { setup } = this;
		if (!setup?.pendingEdits?.length) {
			return Promise.resolve();
		}
		this.stop();
		this.#previousBuild = setup.build ?? this.#previousBuild;
		return this.#attempt(() => this.#saveSetup(withEditsApplied(setup))).then(() =>
			this.runSetup()
		);
	}

	/** Whether it is built and waiting on Start. */
	get awaitingStart(): boolean {
		return Boolean(this.setup?.build && this.setup.awaitingStart);
	}

	/** "Not quite? Tell it what to change." Stops what is running and goes back as far as it must. */
	amend(text: string): Promise<void> {
		const { setup } = this;
		if (!setup) {
			return Promise.resolve();
		}
		this.stop();
		this.#previousBuild = setup.build ?? this.#previousBuild;
		return this.#attempt(() => this.#saveSetup(withAmendment(setup, text))).then(() =>
			this.runSetup()
		);
	}

	// ── playing ───────────────────────────────────────────────────────────────

	/** The user's turn: what they wrote, or nothing for Continue. */
	send(
		text: string,
		answers: { id: string; text: string; remember: boolean }[] = [],
		rolls: { id: string; sides: number; value: number }[] = []
	): Promise<void> {
		const last = this.lastPassage;
		if (!last) {
			return Promise.resolve();
		}
		const { cycles, fields } = turnInputs(
			parseMarkup(last.turn.source, { final: true }),
			this.choices,
			this.values
		);
		this.chips = null;
		return this.#attempt(async (signal) => {
			let parentId = last.id;
			let pending: UserTurn = { kind: 'continue' };
			// A turn is kept when it says something: words, a choice, a field, an answer or a roll.
			if ([text.trim(), cycles.length, fields.length, answers.length, rolls.length].some(Boolean)) {
				const id = crypto.randomUUID();
				const input = { kind: 'input' as const, text, cycles, answers, rolls, fields };
				await appendTurn(this.id, { id, parentId, role: 'user', content: input });
				this.#appended({ id, parentId, role: 'user' }, { id, turn: input });
				parentId = id;
				pending = userTurnOf(input);
			}
			this.choices = {};
			this.values = {};
			await this.#passage({ parentId, pending, take: null, signal });
		});
	}

	/**
	 * Answers the question the passage asked, as the user's turn. Remembered
	 * for this daydream at most: an answer given in the story is part of the
	 * story first, and making it general takes a tap on the notice.
	 */
	async answerQuestion(
		question: { id: string; text: string },
		answer: string,
		remember: boolean
	): Promise<void> {
		const { setup } = this;
		if (remember && setup) {
			const preference = preferenceFromAnswer(question.text, answer, this.#random);
			const preferences = withPreference(setup.preferences, preference);
			if (preferences.length > setup.preferences.length) {
				await this.#attempt(() => this.#saveSetup({ ...setup, preferences }));
				this.#notify({ kind: 'saved', preference, scope: 'story' });
			}
		}
		await this.send('', [{ id: question.id, text: answer, remember }]);
	}

	/**
	 * Rolls the die the passage offered, here in the browser (docs/dreams.md,
	 * "Dice"), and sends the roll as the turn.
	 */
	roll(roll: { id: string; sides: number }): Promise<void> {
		const value = 1 + Math.floor(this.#random() * roll.sides);
		return this.send('', [], [{ id: roll.id, sides: roll.sides, value }]);
	}

	/** Sets a cycling choice in the passage being answered. */
	setChoice(id: string, value: string): void {
		this.choices = { ...this.choices, [id]: value };
	}

	/** Sets a field in the passage being answered (`fieldKey`). */
	setValue(key: string, value: string): void {
		this.values = { ...this.values, [key]: value };
	}

	/** What the user had set and entered, from a draft, if it was for the passage still being answered. */
	restoreInputs(saved: {
		turnId: string;
		choices: Record<string, string>;
		values: Record<string, string>;
	}): void {
		if (saved.turnId === this.lastPassage?.id) {
			this.choices = saved.choices;
			this.values = saved.values;
		}
	}

	/** Another take: the same events in new words, as a version beside it. */
	anotherTake(turnId: string): Promise<void> {
		return this.#rewrite(turnId, 'take');
	}

	/** Tries a failed passage again, as a version beside it. */
	retry(turnId: string): Promise<void> {
		return this.#rewrite(turnId, 'next');
	}

	/**
	 * "Different direction" (docs/dreams.md): what happens changes. The model
	 * lists where the passage could go instead, the turned-down one marked
	 * "not this"; code picks one leaning towards the unlikely, and the passage
	 * is written from it as a version beside the old one. The other directions
	 * are offered as chips under it.
	 */
	differentDirection(turnId: string): Promise<void> {
		return this.#rewrite(turnId, { kind: 'different' });
	}

	/** A chip under a passage: written again, taking that direction. */
	steerTo(turnId: string, direction: string): Promise<void> {
		return this.#rewrite(turnId, { kind: 'steer', direction });
	}

	#rewrite(
		turnId: string,
		how: 'take' | 'next' | { kind: 'different' } | { kind: 'steer'; direction: string }
	): Promise<void> {
		const index = this.path.findIndex((entry) => entry.id === turnId);
		const target = this.path[index];
		if (target?.turn?.kind !== 'passage') {
			return Promise.resolve();
		}
		const { source } = target.turn;
		const before = this.path.slice(0, index);
		const parent = before.at(-1);
		const pending =
			parent?.turn?.kind === 'input' ? userTurnOf(parent.turn) : ({ kind: 'continue' } as const);
		const opening = before.length === 0;
		return this.#attempt((signal) =>
			this.#passage({
				parentId: parent?.id ?? null,
				pending: opening ? null : pending,
				// The opening has no turn to answer, so anything but a fresh take
				// of it is written as one.
				take: how === 'take' || opening ? source : null,
				signal,
				path: before,
				notThis: typeof how === 'object' && how.kind === 'different' ? source : null,
				steer: typeof how === 'object' && how.kind === 'steer' ? how.direction : null,
				different: typeof how === 'object' && how.kind === 'different'
			})
		);
	}

	/**
	 * "Read it differently" (docs/dreams.md, "How a turn is read"): the turn
	 * is answered again, read the way the user chose, as a version beside the
	 * passage that answered it. The reading is kept on the new passage, so it
	 * goes with the turn from then on.
	 */
	reread(turnId: string, reading: Reading): Promise<void> {
		const index = this.path.findIndex((entry) => entry.id === turnId);
		const input = this.path[index];
		if (input?.turn?.kind !== 'input') {
			return Promise.resolve();
		}
		const turn = userTurnOf(input.turn);
		if (turn.kind !== 'words') {
			return Promise.resolve();
		}
		const path = this.path.slice(0, index + 1);
		return this.#attempt((signal) =>
			this.#passage({
				parentId: turnId,
				pending: { ...turn, readAs: reading },
				take: null,
				signal,
				path,
				readAs: reading
			})
		);
	}

	/** The user's own rewrite of a passage, kept as a version beside it. */
	edit(turnId: string, source: string): Promise<void> {
		const index = this.path.findIndex((entry) => entry.id === turnId);
		if (index < 0) {
			return Promise.resolve();
		}
		return this.#attempt(async () => {
			await this.#keepPassage({
				parentId: this.path[index - 1]?.id ?? null,
				request: 'edit',
				source,
				ended: 'complete',
				model: '',
				provider: ''
			});
		});
	}

	/**
	 * Writes a passage after `parentId`. `pending` is the turn it answers
	 * (null for the opening); `take` a passage to write again in new words.
	 */
	async #passage(input: {
		parentId: string | null;
		pending: UserTurn | null;
		take: string | null;
		signal: AbortSignal;
		path?: PathTurn[];
		notThis?: string | null;
		steer?: string | null;
		/** Ask where it could go first, pick, and offer the rest as chips. */
		different?: boolean;
		/** The reading the user chose for the turn it answers, kept on the passage. */
		readAs?: Reading;
	}) {
		const { setup } = this;
		if (!setup?.build) {
			return;
		}
		const path = input.path ?? this.path;
		const request = requestFor(input.take, input.pending, path);
		const memory = memoryFor(
			path,
			this.summaries.map(({ turnId, value }) => ({ turnId, summary: value })),
			input.pending ?? { kind: 'continue' }
		);
		this.streaming = { what: 'passage', text: '', parentId: input.parentId, request };
		const body = passageRequestFor({ ...setup, build: setup.build }, this.worded, {
			elements: elementsAt(setup.build.elements, path, this.#detailsOn(path)),
			summaries: memory.summaries,
			history: input.pending === null ? [] : memory.history,
			take: input.take,
			repeated: repeatedAt(path),
			listening: this.listening
		});
		body.notThis = input.notThis ?? null;
		body.steer = input.steer ?? null;
		// A loop is steered out of the same way "Different direction" works,
		// with code's pick and no chips (docs/dreams.md, "Escaping a loop").
		const steered = [input.take, input.steer, input.different].some(Boolean);
		const stuck = !steered && input.pending !== null && isStuck(path, input.pending);
		let others: string[] = [];
		if (input.different || stuck) {
			const { directions } = parseBriefReading(await listDirections(body, input.signal));
			const picked = pickDirection(directions, directions.length, cryptoRandom);
			if (picked) {
				body.steer = picked.text;
				others = directions.filter((entry) => entry.id !== picked.id).map((entry) => entry.text);
			}
		}
		let reply: StreamResult;
		const watch = this.#watch();
		try {
			reply = await streamReply('passage', body, { signal: input.signal, ...watch.options });
		} catch (cause) {
			// Stopped: what arrived is kept as a version, like a failure part way.
			const text = this.streaming?.text ?? '';
			if (input.signal.aborted && text.trim()) {
				reply = { text, ended: 'stopped', model: '', provider: '' };
			} else {
				throw cause;
			}
		}
		const kept = await this.#keepPassage({
			parentId: input.parentId,
			request,
			source: reply.text,
			ended: reply.ended,
			model: reply.model,
			provider: reply.provider,
			...(input.readAs ? { readAs: input.readAs } : {}),
			...(reply.usage ? { usage: { ...reply.usage, latencyMs: reply.latencyMs } } : {})
		});
		watch.keep(kept, reply);
		this.chips = input.different && others.length > 0 ? { turnId: kept, options: others } : null;
		if (reply.ended === 'refused' || reply.ended === 'failed') {
			this.problem =
				reply.ended === 'refused'
					? 'That passage was refused. Retry, or write your turn differently.'
					: 'The passage stopped part way. What arrived is kept; Retry writes it again.';
		}
	}

	#detailsOn(path: readonly PathTurn[]) {
		return this.details
			.map(({ turnId, value }) => ({ turnId, detail: value }))
			.filter((entry) => path.some((turn) => turn.id === entry.turnId));
	}

	async #keepPassage(input: {
		parentId: string | null;
		request: PassageKind;
		source: string;
		ended: DreamPassageTurn['ended'];
		model: string;
		provider: string;
		readAs?: Reading;
		usage?: DreamPassageTurn['usage'];
	}) {
		const id = crypto.randomUUID();
		const turn: DreamPassageTurn = {
			kind: 'passage',
			source: input.source,
			request: input.request,
			ended: input.ended,
			model: input.model,
			provider: input.provider,
			...(input.readAs ? { readAs: input.readAs } : {}),
			...(input.usage ? { usage: input.usage } : {})
		};
		await appendTurn(this.id, { id, parentId: input.parentId, role: 'model', content: turn });
		const parentIndex = this.path.findIndex((entry) => entry.id === input.parentId);
		this.path = [...this.path.slice(0, parentIndex + 1), { id, turn }];
		this.#appended({ id, parentId: input.parentId, role: 'model' }, null);
		this.streaming = null;
		if (input.ended === 'complete' || input.ended === 'stopped') {
			// In the background: nobody waits on these, and a failure costs only
			// detail, which the next passage's call can still add.
			void this.#afterPassage(id).catch(() => undefined);
			if (input.request !== 'edit') {
				await this.#fromFooter(input.source).catch(() => undefined);
			}
			void this.#designFrom(input.source).catch(() => undefined);
		}
		return id;
	}

	#appended(node: Pick<DreamTreeNodeView, 'id' | 'parentId' | 'role'>, opened: PathTurn | null) {
		const depth = this.tree.find((entry) => entry.id === node.parentId)?.depth ?? -1;
		this.tree = [...this.tree, { ...node, depth: depth + 1, createdAt: new Date() }];
		this.activeTurnId = node.id;
		if (opened) {
			this.path = [...this.path, opened];
		}
	}

	/** Moves to another version of a passage, and down its branch to where it was left. */
	switchTo(turnId: string): Promise<void> {
		return this.#attempt(async () => {
			const leaf = latestLeafUnder(indexTree(this.tree), turnId)?.id ?? turnId;
			await setActiveTurn(this.id, leaf);
			await this.#openBranch(await readBranch(this.id, leaf));
			this.activeTurnId = leaf;
		});
	}

	// ── detail ────────────────────────────────────────────────────────────────

	/** After a passage: facts into the elements and stubs filled, then a summary if a scene ended. */
	async #afterPassage(turnId: string) {
		const { setup } = this;
		if (!setup?.build) {
			return;
		}
		const passages = this.path
			.filter((entry) => entry.turn?.kind === 'passage')
			.slice(-2)
			.map((entry) => (entry.turn as DreamPassageTurn).source);
		if (this.elements.length > 0) {
			const reply = await fill({
				kind: 'elements',
				telling: setup.build.telling,
				limits: this.worded.limits,
				elements: this.elements,
				passages,
				focus: null
			});
			await this.#keepElements(turnId, reply);
		}
		const scene = sceneToSummarise(
			this.path,
			this.summaries.map(({ turnId: id, value }) => ({ turnId: id, summary: value }))
		);
		if (scene) {
			const text = (
				await fill({
					kind: 'summary',
					telling: setup.build.telling,
					limits: this.worded.limits,
					passages: scene.passages.slice(-16)
				})
			).trim();
			if (text) {
				const summary = { text: text.slice(0, 2000), fromTurnId: scene.fromTurnId };
				const id = crypto.randomUUID();
				await saveSummary(this.id, { id, turnId: scene.throughTurnId, summary });
				this.summaries = [...this.summaries, { turnId: scene.throughTurnId, value: summary }];
			}
		}
	}

	async #keepElements(turnId: string, reply: string) {
		const tag = findTag(parseMarkup(reply, { final: true }), 'elements');
		const known = new Map(this.elements.map((element) => [element.id, element]));
		for (const element of parseElements(tag?.children ?? [])) {
			// Only elements that exist: this call keeps records, it does not invent people.
			const current = known.get(element.id);
			if (!current) {
				continue;
			}
			const detail: DreamDetail = {
				kind: 'element',
				element: { ...element, type: current.type, shown: current.shown }
			};
			const id = crypto.randomUUID();
			await saveDetail(this.id, { id, turnId, detail });
			this.details = [...this.details, { turnId, value: detail }];
		}
	}

	/** Opening a card that is only a name: fill it in, once, against the turn the user is on. */
	async fillCard(elementId: string): Promise<void> {
		const { setup } = this;
		const element = this.elements.find((candidate) => candidate.id === elementId);
		const turnId = this.path.at(-1)?.id;
		if (!(setup?.build && element && turnId && needsFilling(element))) {
			return;
		}
		const key = `card:${elementId}`;
		if (this.filling.has(key)) {
			return;
		}
		this.filling = new Set([...this.filling, key]);
		try {
			const passages = this.path
				.filter((entry) => entry.turn?.kind === 'passage')
				.slice(-2)
				.map((entry) => (entry.turn as DreamPassageTurn).source);
			const reply = await fill({
				kind: 'elements',
				telling: setup.build.telling,
				limits: this.worded.limits,
				elements: this.elements,
				passages,
				focus: elementId
			});
			await this.#keepElements(turnId, reply);
		} catch (cause) {
			this.problem =
				cause instanceof DreamRequestError ? cause.message : 'That card could not be filled in.';
		} finally {
			const next = new Set(this.filling);
			next.delete(key);
			this.filling = next;
		}
	}

	/**
	 * Names to choose from for an element's "Another name" (docs/dreams.md,
	 * "Names"), drawn for its description, leaving out every name in the story.
	 */
	async namesFor(elementId: string): Promise<{ given: string[]; family: string[] } | null> {
		const element = this.elements.find((candidate) => candidate.id === elementId);
		if (!element) {
			return null;
		}
		const taken = this.elements.flatMap((other) => [
			other.name,
			...other.name.split(' '),
			...other.also
		]);
		try {
			return await drawNames(element.nameFrom ?? `a ${element.type}`, taken);
		} catch (cause) {
			this.problem =
				cause instanceof DreamRequestError ? cause.message : 'No names could be drawn.';
			return null;
		}
	}

	/**
	 * Renames an element from the turn the user is on. Its old name becomes
	 * one of its other names, so what earlier passages called it still links
	 * to its card.
	 */
	async rename(elementId: string, name: string): Promise<void> {
		const element = this.elements.find((candidate) => candidate.id === elementId);
		const turnId = this.path.at(-1)?.id;
		if (!(element && turnId) || element.name === name) {
			return;
		}
		// The short name went with the old name: the new one is shown whole.
		const { short: _short, ...rest } = element;
		const detail: DreamDetail = {
			kind: 'element',
			element: {
				...rest,
				name,
				also: [element.name, ...element.also.filter((other) => other !== name)].slice(0, 12)
			}
		};
		await this.#attempt(async () => {
			await saveDetail(this.id, { id: crypto.randomUUID(), turnId, detail });
			this.details = [...this.details, { turnId, value: detail }];
		});
	}

	// ── pictures ──────────────────────────────────────────────────────────────

	/** Pictures opened on this page, by marker key, as object URLs. */
	pictures = $state<Record<string, string>>({});
	readonly #opening = new Set<string>();

	/** The picture detail kept for a marker on this branch, if any. */
	#pictureDetail(key: string) {
		return this.details
			.map(({ value }) => value)
			.findLast((detail) => detail.kind === 'picture' && detail.key === key) as
			| Extract<DreamDetail, { kind: 'picture' }>
			| undefined;
	}

	/** Whether a marker already has a picture, drawn or still being opened. */
	hasPicture(key: string): boolean {
		return this.#pictureDetail(key) !== undefined;
	}

	/** Opens a marker's stored picture, once, in the background. */
	showPicture(key: string): void {
		const detail = this.#pictureDetail(key);
		if (!detail || this.pictures[key] || this.#opening.has(key)) {
			return;
		}
		this.#opening.add(key);
		openPicture(this.id, detail.pictureId, detail.fileKey)
			.then((url) => {
				this.pictures = { ...this.pictures, [key]: url };
			})
			.catch(() => undefined)
			.finally(() => this.#opening.delete(key));
	}

	/**
	 * Draws a `<picture>` on tap (docs/dreams.md, "Pictures"): described from
	 * the elements' appearance, made by the server, encrypted and stored here,
	 * its key sealed in a detail on the passage. Drawn once; revisiting shows
	 * the same picture.
	 */
	async drawPicture(
		turnId: string,
		key: string,
		picture: { of: string; caption: string }
	): Promise<void> {
		const { setup } = this;
		if (!setup?.build || this.filling.has(key) || this.hasPicture(key)) {
			return;
		}
		const asked = picturePrompt(picture, this.elements, setup.build.heat);
		if (!asked) {
			return;
		}
		this.filling = new Set([...this.filling, key]);
		try {
			const made = await makePicture(this.id, { ...asked, style: 'illustrated' });
			const pictureId = crypto.randomUUID();
			const fileKey = await storePicture(this.id, pictureId, made);
			const detail: DreamDetail = { kind: 'picture', key, pictureId, fileKey };
			await saveDetail(this.id, { id: crypto.randomUUID(), turnId, detail });
			this.details = [...this.details, { turnId, value: detail }];
			this.pictures = { ...this.pictures, [key]: URL.createObjectURL(made) };
		} catch (cause) {
			this.problem =
				cause instanceof DreamRequestError ? cause.message : 'That picture could not be made.';
		} finally {
			const next = new Set(this.filling);
			next.delete(key);
			this.filling = next;
		}
	}

	/** Expanding a `<more>`: written once, kept on its passage. */
	async expand(turnId: string, key: string, phrase: string): Promise<void> {
		const { setup } = this;
		const passage = this.path.find((entry) => entry.id === turnId)?.turn;
		if (!(setup?.build && passage?.kind === 'passage') || this.filling.has(key)) {
			return;
		}
		this.filling = new Set([...this.filling, key]);
		try {
			const text = (
				await fill({
					kind: 'more',
					telling: setup.build.telling,
					limits: this.worded.limits,
					passage: passage.source,
					phrase
				})
			).trim();
			if (text) {
				const detail: DreamDetail = { kind: 'more', key, text: text.slice(0, 1200) };
				await saveDetail(this.id, { id: crypto.randomUUID(), turnId, detail });
				this.details = [...this.details, { turnId, value: detail }];
			}
		} catch (cause) {
			this.problem =
				cause instanceof DreamRequestError ? cause.message : 'That could not be expanded.';
		} finally {
			const next = new Set(this.filling);
			next.delete(key);
			this.filling = next;
		}
	}
}
