/**
 * A daydream's story as its page plays it: the tree, the branch being read,
 * the passage arriving now, and every way the user can move the story on.
 *
 * BROWSER ONLY — it seals through `client.ts`.
 *
 * One object rather than state spread through components, because almost
 * every control does the same two things in a different order: add a turn
 * after the one the user is on, then ask for the next passage after that.
 * The components (`DaydreamThread.svelte` and the pieces under it) only draw
 * this and call its methods.
 *
 * The tree is kept here once loaded and added to as turns are saved, rather
 * than re-loaded after each one: a load reads every turn's place again, and
 * D1 charges by the row. Turns written on this visit are kept as plaintext
 * too (`written`), because opening a freshly sealed turn is asynchronous and
 * a passage asked for straight after it would otherwise find it still
 * "opening".
 */

import { SvelteMap } from 'svelte/reactivity';
import { openRecord } from '../crypto/sealed';
import { vaultById, vaultsSettled } from '../crypto/vaults.svelte';
import {
	DAYDREAM_LIMITS,
	type DaydreamPictures,
	type DaydreamSetup,
	type DaydreamTurnRole,
	type DialValue,
	type IdeaDials,
	type StoryDials
} from '../daydream';
import { reportRequestFailure } from '../request-failure.svelte';
import {
	type DaydreamMarkContent,
	type DaydreamSetupContent,
	type DaydreamTurnContent,
	type Direction,
	daydreamMarkKind,
	daydreamSetupKind,
	daydreamTurnKind,
	type PassageMeta,
	type Quote,
	type Reading
} from '../sealed-kinds/daydreams';
import {
	openedDaydreamMark,
	openedDaydreamSetup,
	openedDaydreamTurn
} from '../sealed-views.svelte';
import type { DaydreamMarkView, DaydreamTreeNodeView, DaydreamView, SealedRefView } from '../types';
import {
	createMark,
	deleteMark,
	downloadPicture,
	estimatePicture,
	type PromptMessage,
	type ReplyRequestBody,
	readPrompt,
	readTurns,
	requestPicture,
	saveSetup as saveSetupRecord,
	saveTurn,
	setActiveTurn,
	uploadPicture,
	writeReply
} from './client';
import {
	type ContextTurn,
	chosenReadingIn,
	expansionIn,
	passageAsSent,
	passageExcerpt,
	type Reaction,
	toContextTurn,
	trimContext
} from './context';
import { outcomeFor, type RollProposal, roll } from './dice';
import { imagePromptProblem, PICTURE_SIZE, type PictureRequest } from './image-prompt';
import { explicitOoc } from './ooc';
import { type ReceivedLog, type ReceivedRecord, ReplyReceipt } from './received-record';
import type { SentRecord } from './sent-record';
import { suggestName } from './suggest';
import { MAX_NAMING_OPENING } from './suggestions';
import {
	childrenOf,
	currentDirections,
	indexTree,
	isHalted,
	latestLeafUnder,
	type OpenedTurn,
	pathTo,
	siblingsOf
} from './tree';

const NOT_READY = 'This is still getting ready. Try again in a moment.';

const REFUSED_PICTURE = 'This one can’t be pictured.';

/** The direction that hands the next turn to chance, offered to the model as a candidate. */
export const SURPRISE_ME: Direction = { id: 'surprise-me', label: 'Surprise me' };

type Generate = {
	/** The turn the new passage follows; null for an opening. */
	parentId: string | null;
	mode: 'opening' | 'reply' | 'rewrite';
	/**
	 * How the user said they mean the turn the passage follows (Read as…),
	 * in place of the model working it out. Kept by another take or a rewrite
	 * of a passage written with one.
	 */
	readAs?: Reading;
	rewrite?: {
		target: { id: string; text: string };
		quote?: Quote;
		instruction?: string;
		/**
		 * The user's turn as the passage being rewritten wrote it out, if it
		 * did. The rewrite answers the same turn, so it is sent written out and
		 * kept, rather than written out again differently.
		 */
		expansion?: string;
	};
};

/** The user's turn as `request` sends it written out, if it carries one: a rewrite's. */
function carriedIn(request: Generate): string | undefined {
	const forced = request.readAs;
	// A reading forced to anything but an instruction writes nothing out.
	return forced && forced !== 'instruction' ? undefined : request.rewrite?.expansion;
}

export type MarkState = DaydreamMarkView & { content: DaydreamMarkContent | null | undefined };

/**
 * A passage's picture, as the page has it (docs/daydreams.md, "Pictures"):
 * `offered` when the passage describes one that has not been made, being
 * made (since `startedAt`, so the page can say how long it has waited, and
 * `estimateMs`, how long one usually takes here, once the server has said)
 * or opened, shown (`url`; `kept` says whether it is stored yet, and
 * `failed` that storing it did not work),
 * or why it could not be.
 */
export type PictureState =
	| { status: 'offered' }
	| { status: 'generating'; startedAt: number; estimateMs: number | null }
	| { status: 'opening' }
	| { status: 'ready'; url: string; kept: 'saving' | 'kept' | 'failed' }
	| { status: 'failed'; refused: boolean; error: string };

type PictureMark = Extract<DaydreamMarkContent, { type: 'picture' }>;

/**
 * A whole daydream opened into plain JSON: debug mode's Export
 * (docs/debug-mode.md, "Daydreams' raw log"). Every turn on every branch, in
 * the order they were written, with what is stored for each, `raw` included
 * where it was kept. A turn this device cannot open has null content.
 */
export type DaydreamExport = {
	format: 'bound-up-daydream-export';
	version: 1;
	exportedAt: string;
	daydreamId: string;
	setup: DaydreamSetupContent | null;
	/** The turn the page was on, and the branch to it, root first. */
	activeTurnId: string | null;
	branch: string[];
	/** The direction buttons the page offered when it was exported. */
	directionsNow: Direction[];
	turns: (DaydreamTreeNodeView & { content: DaydreamTurnContent | null })[];
	marks: { id: string; turnId: string; content: DaydreamMarkContent | null }[];
};

export class DaydreamStory {
	readonly id: string;
	/** Whether this server can write passages at all. */
	readonly available: boolean;

	tree: DaydreamTreeNodeView[] = $state([]);
	activeTurnId: string | null = $state(null);
	/**
	 * The passage arriving now, as far as it has got; null when nothing is.
	 * `expansion` is the user's turn (`parentId`) as the model is writing it
	 * out, when it is (`PassageMeta.expansion`); `readAs`, the reading the
	 * user chose for it, if they did (Read as…); `reading`, how the reply says
	 * it read it, once it has.
	 */
	streaming: {
		parentId: string | null;
		text: string;
		expansion: string | null;
		readAs: Reading | null;
		reading: Reading | null;
	} | null = $state(null);
	/** What went wrong with the last request, shown with a way to try again. */
	problem: string | null = $state(null);
	/** What "Try again" does. */
	retry: (() => void) | null = $state(null);
	/**
	 * The failed reply's text exactly as it arrived, for debug mode's raw log.
	 * Never saved, since a failed reply is not a turn. Empty when nothing
	 * arrived, or the last problem was not a reply's.
	 */
	problemRaw: string = $state('');
	/**
	 * What else the failed reply's stream carried — reasoning, the model that
	 * answered, the error it ended on — for the same log. Never saved either.
	 */
	problemReceived: ReceivedLog | null = $state(null);
	setupRevision: number = $state(0);

	readonly #setupRef: SealedRefView;
	/** A setup this visit saved, known as plaintext (opening it again is asynchronous). */
	#knownSetup: DaydreamSetup | null = $state(null);
	/** Sealed turns by id, for the ones loaded or saved. */
	readonly #refs = new SvelteMap<string, SealedRefView>();
	/** Turns this visit wrote, as plaintext. */
	readonly #written = new SvelteMap<string, DaydreamTurnContent>();
	#marks: DaydreamMarkView[] = $state([]);
	readonly #writtenMarks = new SvelteMap<string, DaydreamMarkContent>();
	#controller: AbortController | null = null;
	/**
	 * The passage being asked for, written and saved right now, if any. A send
	 * waits for it rather than being refused, so someone who types their next
	 * turn while a passage is still arriving can press Send straight away.
	 */
	#replying: Promise<void> | null = null;
	readonly #loading = new Set<string>();
	/** Whether each passage keeps its reply as it arrived (`raw`): see the constructor. */
	readonly #keepRawReplies: boolean;

	/** Whether this server makes pictures (docs/daydreams.md, "Pictures"). */
	readonly picturesAvailable: boolean;
	/** Pictures this page is making, opening or showing, by passage. */
	readonly #pictures = new SvelteMap<string, PictureState>();

	/**
	 * `keepRawReplies` is for an account granted debug mode, whether or not it
	 * is switched on: every passage then seals the model's reply exactly as it
	 * arrived beside the parsed passage, so any of them can be looked at in
	 * the raw log later (docs/debug-mode.md). The server cannot see inside the
	 * seal to hold anyone to this, so this flag is the whole of the rule.
	 */
	constructor(
		daydream: DaydreamView,
		available: boolean,
		options: {
			keepRawReplies?: boolean;
			/** Whether this server makes pictures. */
			picturesAvailable?: boolean;
		} = {}
	) {
		this.id = daydream.id;
		this.available = available;
		this.#keepRawReplies = options.keepRawReplies ?? false;
		this.picturesAvailable = options.picturesAvailable ?? false;
		this.tree = [...daydream.tree];
		this.activeTurnId = daydream.activeTurnId;
		this.setupRevision = daydream.revision;
		this.#setupRef = daydream.setup;
		this.#marks = [...daydream.marks];
		for (const turn of daydream.path) {
			this.#refs.set(turn.id, turn.sealed);
		}
	}

	// ── reading ──────────────────────────────────────────────────────────────

	readonly index = $derived(indexTree(this.tree));

	/** The branch being read, root first. */
	readonly path = $derived(pathTo(this.index, this.activeTurnId));

	get setup(): DaydreamSetup | null | undefined {
		return this.#knownSetup ?? openedDaydreamSetup(this.#setupRef);
	}

	/** A turn's content: known, `undefined` while it opens or loads, null if it will not open. */
	content(turnId: string): DaydreamTurnContent | null | undefined {
		const known = this.#written.get(turnId);
		if (known !== undefined) {
			return known;
		}
		const ref = this.#refs.get(turnId);
		return ref ? openedDaydreamTurn(ref) : undefined;
	}

	readonly #pathOpened: OpenedTurn[] = $derived(
		this.path.map((node) => ({ content: this.content(node.id) ?? null }))
	);

	/** Whether the scene is stopped (Stop the scene, not yet resumed). */
	readonly halted = $derived(isHalted(this.#pathOpened));

	/** The direction buttons on offer now, besides Continue. */
	readonly directions = $derived(currentDirections(this.#pathOpened));

	readonly busy = $derived(this.streaming !== null);

	/** The turn the user is on, if it is a passage: where suggestions and a roll card show. */
	readonly leafPassage = $derived.by(() => {
		const leaf = this.path.at(-1);
		if (leaf?.role !== 'story') {
			return null;
		}
		const content = this.content(leaf.id);
		return content?.type === 'text' ? { id: leaf.id, meta: content.meta ?? null } : null;
	});

	siblings(turnId: string): readonly DaydreamTreeNodeView[] {
		return siblingsOf(this.index, turnId);
	}

	children(turnId: string | null): readonly DaydreamTreeNodeView[] {
		return childrenOf(this.index, turnId);
	}

	get marks(): MarkState[] {
		return this.#marks.map((mark) => ({
			...mark,
			content: this.#writtenMarks.get(mark.id) ?? openedDaydreamMark(mark.sealed)
		}));
	}

	reactionFor(turnId: string): { id: string; reaction: Reaction } | null {
		for (const mark of this.marks) {
			if (mark.turnId === turnId && mark.content?.type === 'reaction') {
				return { id: mark.id, reaction: mark.content.reaction };
			}
		}
		return null;
	}

	bookmarksFor(turnId: string): MarkState[] {
		return this.marks.filter((mark) => mark.turnId === turnId && mark.content?.type === 'bookmark');
	}

	// ── moving around the tree ───────────────────────────────────────────────

	/** Opens any turns on the branch being read that this page has no content for yet. */
	async ensureLoaded(ids: readonly string[] = this.path.map((node) => node.id)): Promise<void> {
		const missing = ids.filter(
			(id) => !(this.#refs.has(id) || this.#written.has(id) || this.#loading.has(id))
		);
		for (let start = 0; start < missing.length; start += 100) {
			const chunk = missing.slice(start, start + 100);
			for (const id of chunk) {
				this.#loading.add(id);
			}
			const loaded = await readTurns(this.id, chunk);
			for (const id of chunk) {
				this.#loading.delete(id);
			}
			if (!loaded.ok) {
				reportRequestFailure(null, loaded.error);
				return;
			}
			for (const turn of loaded.turns) {
				this.#refs.set(turn.id, turn.sealed);
			}
		}
	}

	/** Moves to `turnId` itself: carrying on from an earlier point. */
	async rewindTo(turnId: string): Promise<void> {
		await this.#moveTo(turnId);
	}

	/** Moves to where the newest branch through `turnId` was left: switching branch. */
	async showBranch(turnId: string): Promise<void> {
		await this.#moveTo(latestLeafUnder(this.index, turnId));
	}

	async #moveTo(turnId: string): Promise<void> {
		if (this.busy || turnId === this.activeTurnId) {
			return;
		}
		this.activeTurnId = turnId;
		this.problem = null;
		this.retry = null;
		const [saved] = await Promise.all([setActiveTurn(this.id, turnId), this.ensureLoaded()]);
		if (!saved.ok) {
			reportRequestFailure(null, saved.error);
		}
	}

	// ── writing ──────────────────────────────────────────────────────────────

	/** Seals and saves a turn after `parentId`, and moves the user to it. */
	async #append(
		parentId: string | null,
		role: DaydreamTurnRole,
		content: DaydreamTurnContent
	): Promise<string | null> {
		const id = crypto.randomUUID();
		const saved = await saveTurn(this.id, { id, parentId, role, content });
		if (!saved.ok) {
			this.problem = saved.error;
			return null;
		}
		this.#written.set(id, content);
		this.#refs.set(id, saved.turn.sealed);
		const { sealed: _sealed, ...node } = saved.turn;
		this.tree = [...this.tree, node];
		this.activeTurnId = id;
		return id;
	}

	/**
	 * The story as the model reads it, up to and including `parentId`, or null
	 * while some of it is still opening — a passage asked for then would be
	 * written without it. A turn that will not open here at all is left out
	 * rather than holding the story up for good.
	 *
	 * Every turn goes as it was first sent (`toContextTurn`), so each request
	 * only adds to the one before: a passage with the buttons its request
	 * listed and, for a rewrite, the passage it rewrote; a reaction as a note
	 * where it was made (`#reactionsAlong`). A user's turn goes with the
	 * reading they chose for it; the last has no passage after it on this
	 * branch, so `last` says that for it, if anything.
	 */
	#contextUpTo(parentId: string | null, last: { readAs?: Reading } = {}): ContextTurn[] | null {
		const context: ContextTurn[] = [];
		const path = pathTo(this.index, parentId);
		const reactions = this.#reactionsAlong(path);
		if (!reactions) {
			return null;
		}
		for (const [index, node] of path.entries()) {
			const content = this.content(node.id);
			if (content === undefined) {
				return null;
			}
			if (content === null) {
				continue;
			}
			const next = path[index + 1];
			const after = next ? this.content(next.id) : undefined;
			// What its request listed, worked out as it was then (`#replyBody`):
			// sent again, the history is what that request sent.
			const before = path
				.slice(0, index)
				.map((earlier) => ({ content: this.content(earlier.id) ?? null }));
			const rewrote = this.#rewrittenAsSent(node.role === 'story' ? content : null);
			if (rewrote === undefined) {
				return null;
			}
			const turn = toContextTurn(node.role, content, {
				readAs: next ? chosenReadingIn(after) : last.readAs,
				...(rewrote === null ? {} : { rewrote }),
				...(node.role === 'story' && !isHalted(before)
					? { buttons: currentDirections(before) }
					: {})
			});
			if (turn) {
				context.push(turn);
			}
			context.push(...(reactions.get(node.id) ?? []));
		}
		return trimContext(context);
	}

	/**
	 * For a passage that rewrote another, the passage it rewrote as it was
	 * sent, which its request quoted (`#replyBody`): null for any other turn,
	 * or one whose target will not open; undefined while the target opens.
	 */
	#rewrittenAsSent(content: DaydreamTurnContent | null): string | null | undefined {
		const targetId = content?.type === 'text' ? content.meta?.rewriteOf?.turnId : undefined;
		if (!targetId) {
			return null;
		}
		const target = this.content(targetId);
		if (target === undefined) {
			return undefined;
		}
		return target?.type === 'text' ? passageAsSent(target.text, expansionIn(target)) : null;
	}

	/**
	 * The reactions on `path`, each as a note after the turn it was made after
	 * (its `after`, or the nearest turn on this path above it when that one is
	 * on another branch), keyed by that turn. A reaction from before marks
	 * said so goes after its own passage, as reactions always did. Null while
	 * a mark on the path is still opening: until it is, which notes there are
	 * cannot be known.
	 */
	#reactionsAlong(path: readonly DaydreamTreeNodeView[]): Map<string, ContextTurn[]> | null {
		const onPath = new Set(path.map((node) => node.id));
		const notes = new Map<string, ContextTurn[]>();
		for (const mark of this.marks) {
			if (!onPath.has(mark.turnId)) {
				continue;
			}
			if (mark.content === undefined) {
				return null;
			}
			if (mark.content?.type !== 'reaction') {
				continue;
			}
			let anchor: string | null = mark.content.after ?? mark.turnId;
			while (anchor !== null && !onPath.has(anchor)) {
				anchor = this.index.byId.get(anchor)?.parentId ?? null;
			}
			const at = anchor ?? mark.turnId;
			const passage = this.content(mark.turnId);
			notes.set(at, [
				...(notes.get(at) ?? []),
				{
					type: 'reaction',
					reaction: mark.content.reaction,
					of: at === mark.turnId || passage?.type !== 'text' ? null : passageExcerpt(passage.text)
				}
			]);
		}
		return notes;
	}

	/** Starts a passage, keeping `#replying` for as long as it runs. */
	#start(request: Generate): Promise<void> {
		const run = this.#generate(request)
			// Never a rejection: a send waits on this, and must go ahead (or say
			// why not) rather than hang on a passage that blew up.
			.catch((cause: unknown) => {
				this.streaming = null;
				this.problem = cause instanceof Error ? cause.message : String(cause);
				this.retry = () => void this.#start(request);
			})
			.finally(() => {
				if (this.#replying === run) {
					this.#replying = null;
				}
			});
		this.#replying = run;
		return run;
	}

	/** What `/reply` is sent for `request`, given the story as the model reads it. */
	#replyBody(request: Generate, setup: DaydreamSetup, context: ContextTurn[]): ReplyRequestBody {
		// What is on screen at the turn the passage follows: the buttons the
		// model is asked to add to or prune.
		const before = pathTo(this.index, request.parentId).map((node) => ({
			content: this.content(node.id) ?? null
		}));
		return {
			mode: request.mode,
			setup,
			turns: context,
			currentDirections: currentDirections(before),
			...(this.#keepRawReplies ? { record: true } : {}),
			...(request.rewrite
				? {
						rewrite: {
							// As the model was shown it, written-out turn and all: the
							// rewritten passage goes back after this request, quoted the same way.
							targetText: passageAsSent(
								request.rewrite.target.text,
								expansionIn(this.content(request.rewrite.target.id))
							),
							...(request.rewrite.quote ? { quote: request.rewrite.quote.text } : {}),
							...(request.rewrite.instruction ? { instruction: request.rewrite.instruction } : {})
						}
					}
				: {})
		};
	}

	/** The story as the model reads it for `request`, or null while some of it is still opening. */
	#contextFor(request: Generate): ContextTurn[] | null {
		return this.#contextUpTo(request.parentId, request.readAs ? { readAs: request.readAs } : {});
	}

	/**
	 * What the story up to `parentId` is sent with but the screen may never
	 * have shown, and is not open yet: the passages its rewrites rewrote,
	 * which are on other branches, and the reactions on it. Without them
	 * `#contextUpTo` would wait for something nothing is opening.
	 */
	#unopenedForContext(parentId: string | null): { turns: string[]; marks: DaydreamMarkView[] } {
		const path = pathTo(this.index, parentId);
		const turns = path.flatMap((node) => {
			const content = this.content(node.id);
			const targetId = content?.type === 'text' ? content.meta?.rewriteOf?.turnId : undefined;
			return targetId && this.content(targetId) === undefined ? [targetId] : [];
		});
		const onPath = new Set(path.map((node) => node.id));
		// Open already through the page's cache counts: only one still opening waits.
		const marks = this.#marks.filter(
			(mark) =>
				onPath.has(mark.turnId) &&
				(this.#writtenMarks.get(mark.id) ?? openedDaydreamMark(mark.sealed)) === undefined
		);
		return { turns, marks };
	}

	/**
	 * Opens what `#unopenedForContext` found. Only awaited when there is
	 * something to open: a passage starting even a moment later than its
	 * turn appeared lost the page's scroll-following, which judges whether
	 * the reader is at the end as each arrives.
	 */
	async #openForContext(unopened: { turns: string[]; marks: DaydreamMarkView[] }): Promise<void> {
		await this.ensureLoaded(unopened.turns);
		await vaultsSettled();
		for (const id of unopened.turns) {
			const ref = this.#refs.get(id);
			const vault = ref ? vaultById(ref.vaultId) : null;
			if (ref && vault && this.content(id) === undefined) {
				const opened = await openRecord(daydreamTurnKind, { ...ref, vault });
				if (opened) {
					this.#written.set(id, opened);
				}
			}
		}
		for (const mark of unopened.marks) {
			const vault = vaultById(mark.sealed.vaultId);
			const opened = vault ? await openRecord(daydreamMarkKind, { ...mark.sealed, vault }) : null;
			if (opened) {
				this.#writtenMarks.set(mark.id, opened);
			}
		}
	}

	async #generate(request: Generate): Promise<void> {
		const unopened = this.#unopenedForContext(request.parentId);
		if (unopened.turns.length > 0 || unopened.marks.length > 0) {
			await this.#openForContext(unopened);
		}
		const { setup } = this;
		const forced = request.readAs;
		const carried = carriedIn(request);
		const context = this.#contextFor(request);
		const parent = request.parentId === null ? undefined : this.index.byId.get(request.parentId);
		const parentContent = parent ? this.content(parent.id) : null;
		// Only words the user wrote, in a story they are in, can be written out:
		// a block the model writes after a button press, Continue, an explicitly
		// out-of-character turn or a watcher's direction is dropped.
		const expandable =
			parent?.role === 'user' &&
			parentContent?.type === 'text' &&
			(forced === 'instruction' || !(forced || explicitOoc(parentContent.text))) &&
			setup?.voice.stance !== 'absent';
		if (!(setup && context)) {
			this.problem = NOT_READY;
			this.retry = () => void this.#start(request);
			return;
		}
		const stopped = isHalted(
			pathTo(this.index, request.parentId).map((node) => ({
				content: this.content(node.id) ?? null
			}))
		);
		this.problem = null;
		this.problemRaw = '';
		this.problemReceived = null;
		this.retry = null;
		this.streaming = {
			parentId: request.parentId,
			text: '',
			expansion: carried ?? null,
			readAs: forced ?? null,
			reading: null
		};
		this.#controller = new AbortController();
		const { signal } = this.#controller;

		let passage: string;
		let meta: PassageMeta | null = null;
		let expansion: string | null = null;
		let reading: Reading | null = null;
		// The reply as it arrives, tags and all, kept even through a Stop.
		let raw = '';
		// What the request sent the model, for the same raw log, also kept through a Stop.
		let sent: SentRecord | null = null;
		// What else the stream carried, for the same raw log, also kept through a Stop.
		const receipt = new ReplyReceipt();
		try {
			const outcome = await writeReply(this.id, this.#replyBody(request, setup, context), {
				signal,
				onSent: (record) => {
					sent = record;
				},
				onEvent: (event) => receipt.take(event),
				onText: (soFar, arrived) => {
					raw = arrived;
					if (this.streaming) {
						this.streaming = {
							...this.streaming,
							text: soFar.passage,
							expansion: carried ?? (expandable ? soFar.expansion : null),
							reading: soFar.reading
						};
					}
				}
			});
			if (!outcome.ok) {
				this.streaming = null;
				this.problem = outcome.error;
				this.problemRaw = outcome.raw;
				this.problemReceived = receipt.log;
				this.retry = () => void this.#start(request);
				return;
			}
			({ passage, meta, expansion, reading, raw } = outcome);
		} catch {
			// Stopped. What had arrived stays, like a sentence cut off: it is
			// what was on screen, and writing it again is one press away. A Stop
			// the scene or Ease off discards it instead (`#interrupt`).
			passage = (this.streaming?.text ?? '').trim();
			if (!passage || signal.reason === DISCARD) {
				this.streaming = null;
				return;
			}
			// A passage had started, so the written-out turn before it was whole.
			expansion = this.streaming?.expansion ?? null;
			reading = this.streaming?.reading ?? null;
		} finally {
			this.#controller = null;
		}

		// A check-in answers the user, never a turn written out for them; and a
		// rewrite keeps the one it was given rather than any the model wrote.
		const writtenOut =
			stopped || !expandable ? null : (carried ?? expansion)?.slice(0, 8000) || null;
		// The reading the reply opened with outranks the one in its metadata,
		// written after the passage had already decided it.
		const readAs = forced ?? (writtenOut ? 'instruction' : (reading ?? meta?.readAs));
		const finalMeta: PassageMeta | undefined =
			meta || stopped || request.rewrite || writtenOut || forced || reading
				? {
						suggestions: stopped ? [] : (meta?.suggestions ?? []),
						directions: stopped
							? { add: [], remove: [] }
							: (meta?.directions ?? { add: [], remove: [] }),
						...(meta?.roll && !stopped ? { roll: meta.roll } : {}),
						// The picture the model described; a check-in has none.
						...(meta?.image && !stopped ? { image: meta.image } : {}),
						...(readAs ? { readAs } : {}),
						...(writtenOut ? { expansion: writtenOut } : {}),
						...(forced ? { readAsChosen: true } : {}),
						// A check-in after Stop the scene is out of character, whatever the model said.
						...(stopped || meta?.ooc ? { ooc: true } : {}),
						...(request.rewrite
							? {
									rewriteOf: {
										turnId: request.rewrite.target.id,
										...(request.rewrite.quote ? { quote: request.rewrite.quote } : {}),
										...(request.rewrite.instruction
											? { instruction: request.rewrite.instruction }
											: {})
									}
								}
							: {})
					}
				: undefined;
		const content: DaydreamTurnContent = {
			type: 'text',
			text: passage.slice(0, 8000),
			...(finalMeta ? { meta: finalMeta } : {}),
			...(this.#keepRawReplies ? keptReply(raw, receipt) : {}),
			...(this.#keepRawReplies && sent ? { sent } : {})
		};
		const saved = await this.#append(request.parentId, 'story', content);
		this.streaming = null;
		if (!saved) {
			this.retry = () => void this.#start(request);
			return;
		}
		if (finalMeta?.image && this.#picturesAutomatic) {
			void this.illustrate(saved);
		}
	}

	/**
	 * What the model would be sent to write the passage `turnId` again, as
	 * the server builds it: debug mode's "Show prompt" (docs/debug-mode.md).
	 * Rebuilt from the story as it stands — today's setup, the turns as the
	 * page has them — so it can differ from what was sent when the passage was
	 * written, which the passage's own `sent` records (`sent-record.ts`); this
	 * is what stands in for it on a passage written before. The request is the one that passage's
	 * own record says it answered: an opening, a reply, or a rewrite of the
	 * passage it names, with any reading the user chose.
	 */
	async promptFor(
		turnId: string
	): Promise<{ ok: true; messages: PromptMessage[] } | { ok: false; error: string }> {
		const node = this.index.byId.get(turnId);
		const content = this.content(turnId);
		const { setup } = this;
		if (!(node && node.role === 'story' && content?.type === 'text' && setup)) {
			return { ok: false, error: NOT_READY };
		}
		const { meta } = content;
		const readAs = chosenReadingIn(content);
		const expansion = expansionIn(content);
		let request: Generate = {
			parentId: node.parentId,
			mode: node.parentId === null ? 'opening' : 'reply',
			...(readAs ? { readAs } : {})
		};
		if (meta?.rewriteOf) {
			const { turnId: targetId, quote, instruction } = meta.rewriteOf;
			await this.ensureLoaded([targetId]);
			const target = this.content(targetId);
			if (target?.type !== 'text') {
				return { ok: false, error: NOT_READY };
			}
			request = {
				...request,
				mode: 'rewrite',
				rewrite: {
					target: { id: targetId, text: target.text },
					...(quote ? { quote } : {}),
					...(instruction ? { instruction } : {}),
					...(expansion ? { expansion } : {})
				}
			};
		}
		await this.#openForContext(this.#unopenedForContext(request.parentId));
		const context = this.#contextFor(request);
		if (!context) {
			return { ok: false, error: NOT_READY };
		}
		return await readPrompt(this.id, this.#replyBody(request, setup, context));
	}

	/**
	 * Everything in the daydream, opened (`DaydreamExport`). Opens each record
	 * afresh rather than reading the page's cache, which fills in as turns
	 * render and would leave a branch never shown as "still opening".
	 */
	async exportHistory(): Promise<DaydreamExport> {
		await this.ensureLoaded(this.tree.map((node) => node.id));
		await vaultsSettled();
		const openRef = async <T>(
			kind: Parameters<typeof openRecord<T>>[0],
			ref: SealedRefView
		): Promise<T | null> => {
			const vault = vaultById(ref.vaultId);
			return vault ? await openRecord(kind, { ...ref, vault }) : null;
		};
		const turns = await Promise.all(
			[...this.tree]
				.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
				.map(async (node) => {
					const written = this.#written.get(node.id);
					const ref = this.#refs.get(node.id);
					const content =
						written ?? (ref ? await openRef<DaydreamTurnContent>(daydreamTurnKind, ref) : null);
					return { ...node, content };
				})
		);
		const marks = await Promise.all(
			this.#marks.map(async (mark) => ({
				id: mark.id,
				turnId: mark.turnId,
				content:
					this.#writtenMarks.get(mark.id) ??
					(await openRef<DaydreamMarkContent>(daydreamMarkKind, mark.sealed))
			}))
		);
		return {
			format: 'bound-up-daydream-export',
			version: 1,
			exportedAt: new Date().toISOString(),
			daydreamId: this.id,
			setup:
				this.#knownSetup ??
				(await openRef<DaydreamSetupContent>(daydreamSetupKind, this.#setupRef)),
			activeTurnId: this.activeTurnId,
			branch: this.path.map((node) => node.id),
			directionsNow: this.directions,
			turns,
			marks
		};
	}

	/** Ends the passage arriving now. `discard` drops what had arrived rather than keeping it. */
	stop(discard = false): void {
		this.#controller?.abort(discard ? DISCARD : undefined);
	}

	/** Waits until no passage is being written, however many were queued behind each other. */
	async #settled(): Promise<void> {
		for (let running = this.#replying; running !== null; running = this.#replying) {
			await running;
		}
	}

	/** The opening, asked for by itself when a daydream has no turns yet. */
	open(): void {
		if (this.tree.length === 0 && this.available && !this.busy) {
			void this.#start({ parentId: null, mode: 'opening' });
		}
	}

	/**
	 * Sends what the user wrote. Answers null once the turn is saved — not once
	 * the passage has come: one that fails leaves the user's turn in the story,
	 * with "Try again" beside it, rather than back in the box — or the reason
	 * it could not be saved.
	 */
	async send(text: string): Promise<string | null> {
		if (!this.setup) {
			return NOT_READY;
		}
		await this.#settled();
		const id = await this.#append(this.activeTurnId, 'user', { type: 'text', text });
		if (!id) {
			return this.problem ?? NOT_READY;
		}
		void this.#start({ parentId: id, mode: 'reply' });
		return null;
	}

	/** More of the story, with nothing said: no turn is added for the press itself. */
	async continueStory(): Promise<void> {
		await this.#settled();
		void this.#start({
			parentId: this.activeTurnId,
			mode: this.activeTurnId ? 'reply' : 'opening'
		});
	}

	/** A direction button: recorded as a turn, so a reload, a retry or a branch all see it. */
	async direct(direction: Direction): Promise<void> {
		await this.#settled();
		const id = await this.#append(this.activeTurnId, 'user', { type: 'direction', ...direction });
		if (id) {
			void this.#start({ parentId: id, mode: 'reply' });
		}
	}

	/**
	 * Another take on a passage: a new turn beside it, which the user is moved
	 * to. A reading the user chose for the turn before it still stands.
	 */
	async writeAgain(turnId: string): Promise<void> {
		const node = this.index.byId.get(turnId);
		if (!node || this.busy) {
			return;
		}
		const readAs = chosenReadingIn(this.content(turnId));
		await this.#settled();
		void this.#start({
			parentId: node.parentId,
			mode: node.parentId === null ? 'opening' : 'reply',
			...(readAs ? { readAs } : {})
		});
	}

	/**
	 * Read as…: the user's turn read the way they say they meant it rather
	 * than the way the model took it. A fork, not a correction — the passage
	 * after it may already be written, and is kept beside the new one (the
	 * switcher reaches both). One still arriving is stopped and kept, as Stop
	 * keeps it, and the new passage is asked for from the turn itself.
	 */
	async reread(turnId: string, readAs: Reading): Promise<void> {
		const node = this.index.byId.get(turnId);
		if (node?.role !== 'user' || this.content(turnId)?.type !== 'text') {
			return;
		}
		this.stop();
		await this.#settled();
		await this.#moveTo(turnId);
		void this.#start({ parentId: turnId, mode: 'reply', readAs });
	}

	/** A passage rewritten, as a new turn beside it; on an older passage that starts a branch. */
	async rewrite(
		turnId: string,
		options: { quote?: Quote; instruction?: string } = {}
	): Promise<void> {
		const node = this.index.byId.get(turnId);
		const content = this.content(turnId);
		if (!node || content?.type !== 'text' || this.busy) {
			return;
		}
		await this.#settled();
		const expansion = expansionIn(content);
		const readAs = chosenReadingIn(content);
		void this.#start({
			parentId: node.parentId,
			mode: 'rewrite',
			...(readAs ? { readAs } : {}),
			rewrite: {
				target: { id: turnId, text: content.text },
				...options,
				...(expansion ? { expansion } : {})
			}
		});
	}

	/** "More of this", about a stretch of a passage: a steer turn, then the next passage. */
	async moreOf(turnId: string, quote: Quote): Promise<void> {
		await this.#settled();
		const id = await this.#append(this.activeTurnId, 'user', {
			type: 'steer',
			action: 'more',
			targetTurnId: turnId,
			quote
		});
		if (id) {
			void this.#start({ parentId: id, mode: 'reply' });
		}
	}

	/**
	 * "Not this": adds a line to the setup's limits, so it never comes back,
	 * and rewrites the passage when it is the one the user is on. An older
	 * passage is left as it was; the limit applies from here on.
	 */
	async notThis(turnId: string, quote: Quote, line: string): Promise<string | null> {
		// Added to the limits as they are by the save's turn, so a limit saved
		// meanwhile is kept rather than written over.
		let full = false;
		const saved = await this.saveSetup((setup) => {
			const limits = setup.limits.trim() ? `${setup.limits.trim()}\n${line}` : line;
			if (limits.length > 1000) {
				full = true;
				return null;
			}
			return { ...setup, limits };
		});
		if (full) {
			return 'Your limits are full. Make room for this one on the setup page.';
		}
		if (saved) {
			return saved;
		}
		if (turnId === this.activeTurnId) {
			await this.rewrite(turnId, { quote, instruction: `Leave this out entirely: ${line}` });
		}
		return null;
	}

	/** Rolls the die a passage proposed, then asks for the passage that honours it. */
	async rollFor(proposalTurnId: string, proposal: RollProposal): Promise<void> {
		await this.#settled();
		const result = roll(proposal.sides);
		const outcome = outcomeFor(proposal, result);
		if (!outcome) {
			return;
		}
		const id = await this.#append(this.activeTurnId, 'user', {
			type: 'roll',
			proposalTurnId,
			sides: proposal.sides,
			result,
			outcome: outcome.label
		});
		if (id) {
			void this.#start({ parentId: id, mode: 'reply' });
		}
	}

	// ── safety ───────────────────────────────────────────────────────────────

	/** Drops whatever is arriving, and waits for it to be gone. */
	async #interrupt(): Promise<void> {
		this.stop(true);
		await this.#settled();
	}

	/**
	 * Stop the scene. Whatever was arriving is dropped, not kept: it may be
	 * the very thing that made someone press it. The server answers a stopped
	 * story with a check-in, whatever is asked for.
	 */
	async stopScene(): Promise<void> {
		await this.#interrupt();
		const id = await this.#append(this.activeTurnId, 'user', { type: 'safety', signal: 'red' });
		if (id) {
			void this.#start({ parentId: id, mode: 'reply' });
		}
	}

	/** Ease off: the story carries on, gentler, and the intensity dial comes down a notch. */
	async easeOff(): Promise<void> {
		await this.#interrupt();
		await this.saveSetup((setup) =>
			setup.dials.intensity > 1
				? {
						...setup,
						dials: { ...setup.dials, intensity: (setup.dials.intensity - 1) as DialValue }
					}
				: null
		);
		const id = await this.#append(this.activeTurnId, 'user', { type: 'safety', signal: 'yellow' });
		if (id) {
			void this.#start({ parentId: id, mode: 'reply' });
		}
	}

	/** Carry on after stopping. */
	async resume(): Promise<void> {
		await this.#settled();
		const id = await this.#append(this.activeTurnId, 'user', { type: 'safety', signal: 'resume' });
		if (id) {
			void this.#start({ parentId: id, mode: 'reply' });
		}
	}

	// ── the setup, from here ─────────────────────────────────────────────────

	/** The setup saves under way, in order: each starts once the one before has answered. */
	#setupWrites: Promise<unknown> = Promise.resolve();

	/**
	 * Saves a change to the setup (the dials, a limit, its name). Answers why
	 * not, or null.
	 *
	 * Takes the change rather than the setup it makes, and saves one at a time,
	 * because more than one can be under way at once: naming a story writes its
	 * title in the background just as its opening arrives, which is just when
	 * someone reaches for the heat. Each save is compare-and-swap on the
	 * revision, so two sent together carried the same one and the second was
	 * refused — the heat change silently did not apply. Queued, each one runs
	 * after the last has answered, on the setup and revision that left, so
	 * neither is refused and neither undoes the other. `change` answers null to
	 * save nothing, for a change that no longer makes sense by its turn.
	 */
	saveSetup(change: (setup: DaydreamSetup) => DaydreamSetup | null): Promise<string | null> {
		const write = this.#setupWrites.then(async () => {
			const { setup } = this;
			if (!setup) {
				return NOT_READY;
			}
			const next = change(setup);
			if (!next) {
				return null;
			}
			const saved = await saveSetupRecord(this.id, next, this.setupRevision);
			if (!saved.ok) {
				return saved.error;
			}
			this.#knownSetup = next;
			this.setupRevision = saved.revision;
			return null;
		});
		this.#setupWrites = write.catch(() => undefined);
		return write;
	}

	async setDials(dials: StoryDials): Promise<string | null> {
		return await this.saveSetup((setup) => ({ ...setup, dials }));
	}

	/**
	 * The idea's heat and kink, turned up or down mid-story. Only this
	 * daydream's copy of the idea changes, never the library's: like any
	 * edit to a setup, it applies from the next passage on.
	 */
	async setIdeaDials(dials: IdeaDials): Promise<string | null> {
		return await this.saveSetup((setup) => ({ ...setup, idea: { ...setup.idea, dials } }));
	}

	/**
	 * A daydream's pictures switched on or off, or their style changed,
	 * mid-story. Neither reaches the story model's prompt (docs/daydreams.md,
	 * "Pictures"), so neither costs it its cache.
	 */
	async setPictures(pictures: DaydreamPictures): Promise<string | null> {
		return await this.saveSetup((setup) => ({ ...setup, pictures }));
	}

	async setPicturesOn(on: boolean): Promise<string | null> {
		const { setup } = this;
		return setup ? await this.setPictures({ ...setup.pictures, on }) : NOT_READY;
	}

	/** This visit's request for a name, once made: once is enough, whatever came of it. */
	#naming: Promise<string | null> | null = null;

	/**
	 * Names a daydream that has no name yet, once its opening is written: the
	 * setup form asks for none, so nobody has to think of one before they
	 * have started (docs/daydreams.md, "Naming").
	 *
	 * Answers the name once it is saved, or null. Background work nobody
	 * waits on, so it never says why it did not: the idea's title stands in
	 * meanwhile (`daydreamTitle`), and the next visit asks again. Never
	 * retried on a revision conflict either — something else just changed the
	 * setup, and naming is not worth overwriting it.
	 */
	nameIfUnnamed(): Promise<string | null> {
		const { setup } = this;
		const opening = this.path.find((node) => node.role === 'story');
		const content = opening ? this.content(opening.id) : null;
		// Only a request worth making is remembered: one asked too early, before
		// the opening had opened, must not stand in for the real one.
		if (this.available && setup && setup.title.trim() === '' && content?.type === 'text') {
			this.#naming ??= this.#name(setup, content.text);
		}
		return this.#naming ?? Promise.resolve(null);
	}

	async #name(setup: DaydreamSetup, opening: string): Promise<string | null> {
		const answer = await suggestName({
			idea: { title: setup.idea.title, premise: setup.idea.premise },
			characters: setup.characters.map((character) => character.name),
			opening: opening.slice(0, MAX_NAMING_OPENING),
			limits: setup.limits
		});
		if (!answer.ok) {
			return null;
		}
		// Applied to the setup as it is by its turn, which may have changed
		// while the model thought — and is not applied at all if, meanwhile,
		// someone named it themselves.
		let named = false;
		const failed = await this.saveSetup((now) => {
			if (now.title.trim() !== '') {
				return null;
			}
			named = true;
			return { ...now, title: answer.value };
		});
		return failed === null && named ? answer.value : null;
	}

	// ── marks ────────────────────────────────────────────────────────────────

	async #addMark(turnId: string, content: DaydreamMarkContent): Promise<string | null> {
		const id = crypto.randomUUID();
		const created = await createMark(this.id, { id, turnId, content });
		if (!created.ok) {
			return created.error;
		}
		this.#writtenMarks.set(id, content);
		this.#marks = [...this.#marks, { id, turnId, revision: 0, sealed: created.sealed }];
		return null;
	}

	async removeMark(markId: string): Promise<string | null> {
		const removed = await deleteMark(this.id, markId);
		if (!removed.ok) {
			return removed.error;
		}
		this.#marks = this.#marks.filter((mark) => mark.id !== markId);
		return null;
	}

	/** One reaction per passage: pressing the one it has takes it off, another replaces it. */
	async react(turnId: string, reaction: Reaction): Promise<string | null> {
		// Where in the story it was made, so it goes to the model there
		// (`#reactionsAlong`). A passage being written now was asked for without
		// it, so it waits for that passage and goes after it.
		await this.#settled();
		const after = this.path.at(-1)?.id;
		const current = this.reactionFor(turnId);
		if (current) {
			const removed = await this.removeMark(current.id);
			if (removed || current.reaction === reaction) {
				return removed;
			}
		}
		return await this.#addMark(turnId, { type: 'reaction', reaction, ...(after ? { after } : {}) });
	}

	// ── pictures ─────────────────────────────────────────────────────────────

	/** Whether a passage's picture is made as soon as it is written. */
	get #picturesAutomatic(): boolean {
		return this.picturesAvailable && (this.setup?.pictures.on ?? false);
	}

	/** A passage's stored picture, if it has one. */
	#pictureMark(turnId: string): PictureMark | null {
		for (const mark of this.marks) {
			if (mark.turnId === turnId && mark.content?.type === 'picture') {
				return mark.content;
			}
		}
		return null;
	}

	/**
	 * A passage's picture as the page has it, or null for one with none to
	 * offer. A stored one not opened yet is `opening`: the passage asks for it
	 * (`openPicture`) when it is drawn.
	 */
	pictureFor(turnId: string): PictureState | null {
		const known = this.#pictures.get(turnId);
		if (known) {
			return known;
		}
		if (this.#pictureMark(turnId)) {
			return { status: 'opening' };
		}
		const content = this.content(turnId);
		return this.picturesAvailable && content?.type === 'text' && content.meta?.image
			? { status: 'offered' }
			: null;
	}

	/**
	 * The picture nearest above a passage on its own branch that is on screen
	 * already, if any: what its picture's placeholder is drawn from while it
	 * is made, since the next picture of a story tends to look like the last.
	 */
	previousPictureUrl(turnId: string): string | null {
		let id = this.index.byId.get(turnId)?.parentId ?? null;
		while (id !== null) {
			const state = this.#pictures.get(id);
			if (state?.status === 'ready') {
				return state.url;
			}
			id = this.index.byId.get(id)?.parentId ?? null;
		}
		return null;
	}

	/**
	 * What the image model was asked for a passage's picture, for the raw log:
	 * from its mark when it was kept with one, or from the request just made
	 * when it is not kept yet. Null when neither says.
	 */
	pictureRequest(turnId: string): PictureRequest | null {
		return this.#pictureMark(turnId)?.sent ?? this.#madePictures.get(turnId)?.sent ?? null;
	}

	/** Opens a passage's stored picture: downloaded, decrypted, shown. Once. */
	async openPicture(turnId: string): Promise<void> {
		const mark = this.#pictureMark(turnId);
		if (!mark || this.#pictures.has(turnId)) {
			return;
		}
		this.#pictures.set(turnId, { status: 'opening' });
		const downloaded = await downloadPicture(this.id, mark.imageId);
		if (!downloaded.ok) {
			this.#pictures.set(turnId, { status: 'failed', refused: false, error: downloaded.error });
			return;
		}
		const { decryptAttachment } = await import('../crypto/messages');
		const picture = await decryptAttachment(downloaded.ciphertext, {
			id: mark.imageId,
			key: mark.key,
			kind: 'image',
			mimeType: mark.mimeType,
			fileName: ''
		});
		this.#pictures.set(turnId, {
			status: 'ready',
			url: URL.createObjectURL(picture),
			kept: 'kept'
		});
	}

	/**
	 * Makes a passage's picture from the description it was written with,
	 * shows it as soon as it comes, then keeps it: encrypted here under a key
	 * of its own (`encryptAttachment`), stored, and the key sealed in a mark on
	 * the passage. A picture that came but could not be kept stays on screen,
	 * `kept: 'failed'`, for `keepPicture` to try again.
	 */
	async illustrate(turnId: string): Promise<void> {
		const content = this.content(turnId);
		const prompt = content?.type === 'text' ? content.meta?.image : undefined;
		const { setup } = this;
		const busy = this.#pictures.get(turnId)?.status;
		if (!(prompt && setup && this.picturesAvailable) || busy === 'generating' || busy === 'ready') {
			return;
		}
		// The same check the server makes, so a refused one is never sent.
		if (imagePromptProblem(prompt) !== null) {
			this.#pictures.set(turnId, { status: 'failed', refused: true, error: REFUSED_PICTURE });
			return;
		}
		const generating = { status: 'generating', startedAt: Date.now(), estimateMs: null } as const;
		this.#pictures.set(turnId, generating);
		// Alongside, not before: the picture waits on nothing. Only applied to
		// the same attempt, still going, so a late answer cannot touch a retry.
		void estimatePicture(this.id, setup.pictures.style).then((estimateMs) => {
			const now = this.#pictures.get(turnId);
			if (
				estimateMs !== null &&
				now?.status === 'generating' &&
				now.startedAt === generating.startedAt
			) {
				this.#pictures.set(turnId, { ...generating, estimateMs });
			}
		});
		const made = await requestPicture(this.id, {
			prompt,
			style: setup.pictures.style,
			heat: setup.idea.dials.heat
		});
		if (!made.ok) {
			this.#pictures.set(turnId, {
				status: 'failed',
				refused: made.refused,
				error: made.refused ? REFUSED_PICTURE : made.error
			});
			return;
		}
		this.#pictures.set(turnId, {
			status: 'ready',
			url: URL.createObjectURL(made.picture),
			kept: 'saving'
		});
		this.#madePictures.set(turnId, { picture: made.picture, sent: made.sent });
		await this.keepPicture(turnId);
	}

	/**
	 * Pictures made here and not kept yet, by passage, with what the image
	 * model was asked for them: what `keepPicture` stores.
	 */
	readonly #madePictures = new SvelteMap<string, { picture: Blob; sent: PictureRequest | null }>();

	/** Stores a picture made here, encrypted, and seals its key into a mark on the passage. */
	async keepPicture(turnId: string): Promise<void> {
		const made = this.#madePictures.get(turnId);
		const state = this.#pictures.get(turnId);
		if (!(made && state?.status === 'ready')) {
			return;
		}
		const { picture, sent } = made;
		this.#pictures.set(turnId, { ...state, kept: 'saving' });
		const { encryptAttachment } = await import('../crypto/messages');
		const sealed = await encryptAttachment(
			new File([picture], 'picture.webp', { type: picture.type || 'image/webp' })
		);
		const ciphertext = await new Response(sealed.body).blob();
		const imageId = crypto.randomUUID();
		// The object before the mark, as messaging stores attachments: a crash
		// between leaves an unreadable orphan, never a mark pointing at nothing.
		const stored = await uploadPicture(this.id, imageId, ciphertext);
		const marked = stored.ok
			? await this.#addMark(turnId, {
					type: 'picture',
					imageId,
					key: sealed.key,
					mimeType: 'image/webp',
					width: PICTURE_SIZE.width,
					height: PICTURE_SIZE.height,
					// For the raw log, kept under the same rule as a passage's `raw`.
					...(this.#keepRawReplies && sent ? { sent } : {})
				})
			: stored.error;
		if (marked === null) {
			this.#madePictures.delete(turnId);
		}
		this.#pictures.set(turnId, { ...state, kept: marked === null ? 'kept' : 'failed' });
	}

	/** Tries a failed picture again: opening it if it was stored, making it if not. */
	async retryPicture(turnId: string): Promise<void> {
		if (this.#pictures.get(turnId)?.status !== 'failed') {
			return;
		}
		this.#pictures.delete(turnId);
		await (this.#pictureMark(turnId) ? this.openPicture(turnId) : this.illustrate(turnId));
	}

	/** Frees the pictures this page has shown. For when the page is left. */
	dispose(): void {
		for (const state of this.#pictures.values()) {
			if (state.status === 'ready') {
				URL.revokeObjectURL(state.url);
			}
		}
	}

	async bookmark(
		turnId: string,
		options: { label?: string; quote?: Quote | null } = {}
	): Promise<string | null> {
		return await this.#addMark(turnId, {
			type: 'bookmark',
			label: options.label?.trim() ?? '',
			quote: options.quote ?? null
		});
	}
}

/** The abort reason that means "drop what arrived", from Stop the scene and Ease off. */
const DISCARD = 'discard';

/**
 * A reply as it arrived, ready to keep on its passage: cut to
 * `DAYDREAM_LIMITS.rawReply`, and saying so when it was. Nothing for a reply
 * that never arrived.
 */
export function rawReply(raw: string): { raw?: string; rawTruncated?: true } {
	if (raw === '') {
		return {};
	}
	return raw.length > DAYDREAM_LIMITS.rawReply
		? { raw: raw.slice(0, DAYDREAM_LIMITS.rawReply), rawTruncated: true }
		: { raw };
}

/**
 * Everything a passage keeps of how its reply arrived: the reply itself
 * (`rawReply`), and what else its stream carried (`received`), whose
 * reasoning gets what room the reply leaves in `rawReply`.
 */
function keptReply(
	raw: string,
	receipt: ReplyReceipt
): { raw?: string; rawTruncated?: true; received?: ReceivedRecord } {
	const kept = rawReply(raw);
	const received = receipt.record(kept.raw ?? '');
	return received ? { ...kept, received } : kept;
}
