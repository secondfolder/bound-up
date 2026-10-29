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
	passageRequestFor,
	readRequestFor,
	type Worded
} from '$lib/dream/assemble';
import { parseBuild } from '$lib/dream/build';
import { parseElements } from '$lib/dream/elements';
import { turnInputs } from '$lib/dream/fields';
import { findTag, parseMarkup } from '$lib/dream/markup';
import { drawNudges } from '$lib/dream/nudges';
import { cryptoRandom } from '$lib/dream/random';
import { parseBriefReading } from '$lib/dream/reading';
import {
	codePick,
	type SetupStep,
	setupStep,
	userPick,
	withAmendment,
	withAnswer,
	withReading
} from '$lib/dream/setup-flow';
import {
	elementsAt,
	expansionsAt,
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
import type {
	DreamDetail,
	DreamPassageTurn,
	DreamSetup,
	DreamSetupBuild,
	DreamSummary,
	PassageRequest as PassageKind
} from '$lib/sealed-kinds/dreams';
import {
	appendTurn,
	DreamRequestError,
	fill,
	openDetail,
	openSetup,
	openSummary,
	openTurn,
	readBranch,
	type StreamResult,
	saveDetail,
	saveSetup,
	saveSummary,
	setActiveTurn,
	streamReply
} from './api';

export type Streaming = {
	what: 'read' | 'build' | 'passage';
	text: string;
	/** For a passage: the turn it will follow, and what asked for it. */
	parentId?: string | null;
	request?: PassageKind;
};

type Opened<T> = { turnId: string; value: T };

/** Seeds for code's draws: random in play, fixed by the simulated player. */
export type SessionOptions = { seed?: () => number; worded: Worded };

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
	/** Whether the setup or the story could not be opened on this device. */
	unreadable = $state(false);

	/** The user's limits and preferences as prompts take them; set again once the setup opens. */
	worded: Worded;
	readonly #seed: () => number;
	#abort: AbortController | null = null;
	/** The build a change is to, kept while the page is open (not stored). */
	#previousBuild: DreamSetupBuild | null = null;

	constructor(id: string, options: SessionOptions) {
		this.id = id;
		this.worded = options.worded;
		this.#seed = options.seed ?? (() => Math.floor(cryptoRandom() * 2 ** 31));
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
		try {
			await work(abort.signal);
		} catch (cause) {
			if (!abort.signal.aborted) {
				this.problem =
					cause instanceof DreamRequestError
						? cause.message
						: 'Something went wrong. Please try again.';
			}
		} finally {
			if (this.#abort === abort) {
				this.#abort = null;
				this.streaming = null;
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
					await this.#saveSetup(codePick(setup, this.#seed()));
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
		const reply = await streamReply(
			'read',
			readRequestFor(setup, this.worded, drawNudges(cryptoRandom)),
			{ signal, onText: (text) => this.#streamed(text) }
		);
		if (reply.ended !== 'complete' || parseBriefReading(reply.text).directions.length === 0) {
			throw new DreamRequestError(
				'The brief could not be read just now. Try again, or change it.',
				502
			);
		}
		await this.#saveSetup(withReading(setup, parseBriefReading(reply.text)));
	}

	async #build(setup: DreamSetup, signal: AbortSignal) {
		this.streaming = { what: 'build', text: '' };
		const reply = await streamReply(
			'build',
			buildRequestFor(setup, this.worded, this.#previousBuild),
			{ signal, onText: (text) => this.#streamed(text) }
		);
		const { passage, ...build } = parseBuild(reply.text);
		if (!(build.title && passage) || reply.ended === 'refused') {
			throw new DreamRequestError(
				'The daydream could not be written just now. Try again, or change the brief.',
				502
			);
		}
		this.#previousBuild = null;
		await this.#saveSetup({ ...setup, build });
		await this.#keepPassage({
			parentId: null,
			request: 'opening',
			source: passage,
			ended: reply.ended === 'complete' ? 'complete' : reply.ended,
			model: reply.model,
			provider: reply.provider
		});
	}

	#streamed(text: string) {
		if (this.streaming) {
			this.streaming = { ...this.streaming, text };
		}
	}

	/** Answers step 1's question; it reads the brief again with the answer. */
	answer(text: string): Promise<void> {
		const { setup } = this;
		if (!setup) {
			return Promise.resolve();
		}
		return this.#attempt(() => this.#saveSetup(withAnswer(setup, text))).then(() =>
			this.runSetup()
		);
	}

	/** Chooses a direction, stopping a build of another. */
	choose(directionId: string): Promise<void> {
		const { setup } = this;
		if (!setup) {
			return Promise.resolve();
		}
		this.stop();
		return this.#attempt(() => this.#saveSetup(userPick(setup, directionId, this.#seed()))).then(
			() => this.runSetup()
		);
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
	send(text: string): Promise<void> {
		const last = this.lastPassage;
		if (!last) {
			return Promise.resolve();
		}
		const { cycles, fields } = turnInputs(
			parseMarkup(last.turn.source, { final: true }),
			this.choices,
			this.values
		);
		return this.#attempt(async (signal) => {
			let parentId = last.id;
			let pending: UserTurn = { kind: 'continue' };
			// A turn is kept when it says something: words, a choice or a field.
			if (text.trim() || cycles.length > 0 || fields.length > 0) {
				const id = crypto.randomUUID();
				const input = { kind: 'input' as const, text, cycles, answers: [], rolls: [], fields };
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

	#rewrite(turnId: string, request: 'take' | 'next'): Promise<void> {
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
		return this.#attempt((signal) =>
			this.#passage({
				parentId: parent?.id ?? null,
				pending: before.length > 0 ? pending : null,
				take: request === 'take' || before.length === 0 ? source : null,
				signal,
				path: before
			})
		);
	}

	/** The user's own rewrite of a passage, kept as a version beside it. */
	edit(turnId: string, source: string): Promise<void> {
		const index = this.path.findIndex((entry) => entry.id === turnId);
		if (index < 0) {
			return Promise.resolve();
		}
		return this.#attempt(() =>
			this.#keepPassage({
				parentId: this.path[index - 1]?.id ?? null,
				request: 'edit',
				source,
				ended: 'complete',
				model: '',
				provider: ''
			})
		);
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
			repeated: repeatedAt(path)
		});
		let reply: StreamResult;
		try {
			reply = await streamReply('passage', body, {
				signal: input.signal,
				onText: (text) => this.#streamed(text)
			});
		} catch (cause) {
			// Stopped: what arrived is kept as a version, like a failure part way.
			const text = this.streaming?.text ?? '';
			if (input.signal.aborted && text.trim()) {
				reply = { text, ended: 'stopped', model: '', provider: '' };
			} else {
				throw cause;
			}
		}
		await this.#keepPassage({
			parentId: input.parentId,
			request,
			source: reply.text,
			ended: reply.ended,
			model: reply.model,
			provider: reply.provider
		});
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
	}) {
		const id = crypto.randomUUID();
		const turn: DreamPassageTurn = {
			kind: 'passage',
			source: input.source,
			request: input.request,
			ended: input.ended,
			model: input.model,
			provider: input.provider
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
		}
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
