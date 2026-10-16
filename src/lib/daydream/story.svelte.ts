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
import type { DaydreamSetup, DaydreamTurnRole, DialValue, StoryDials } from '../daydream';
import { reportRequestFailure } from '../request-failure.svelte';
import type {
	DaydreamMarkContent,
	DaydreamTurnContent,
	Direction,
	PassageMeta,
	Quote
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
	readTurns,
	saveSetup as saveSetupRecord,
	saveTurn,
	setActiveTurn,
	writeReply
} from './client';
import { type ContextTurn, type Reaction, toContextTurn, trimContext } from './context';
import { outcomeFor, type RollProposal, roll } from './dice';
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

/** The direction that hands the next turn to chance, offered to the model as a candidate. */
export const SURPRISE_ME: Direction = { id: 'surprise-me', label: 'Surprise me' };

type Generate = {
	/** The turn the new passage follows; null for an opening. */
	parentId: string | null;
	mode: 'opening' | 'reply' | 'rewrite';
	rewrite?: { target: { id: string; text: string }; quote?: Quote; instruction?: string };
};

export type MarkState = DaydreamMarkView & { content: DaydreamMarkContent | null | undefined };

export class DaydreamStory {
	readonly id: string;
	/** Whether this server can write passages at all. */
	readonly available: boolean;

	tree: DaydreamTreeNodeView[] = $state([]);
	activeTurnId: string | null = $state(null);
	/** The passage arriving now, as far as it has got; null when nothing is. */
	streaming: { parentId: string | null; text: string } | null = $state(null);
	/** What went wrong with the last request, shown with a way to try again. */
	problem: string | null = $state(null);
	/** What "Try again" does. */
	retry: (() => void) | null = $state(null);
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

	constructor(daydream: DaydreamView, available: boolean) {
		this.id = daydream.id;
		this.available = available;
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
	 */
	#contextUpTo(parentId: string | null): ContextTurn[] | null {
		const context: ContextTurn[] = [];
		for (const node of pathTo(this.index, parentId)) {
			const content = this.content(node.id);
			if (content === undefined) {
				return null;
			}
			if (content === null) {
				continue;
			}
			const turn = toContextTurn(node.role, content, this.reactionFor(node.id)?.reaction);
			if (turn) {
				context.push(turn);
			}
		}
		return trimContext(context);
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

	async #generate(request: Generate): Promise<void> {
		const { setup } = this;
		const context = this.#contextUpTo(request.parentId);
		if (!(setup && context)) {
			this.problem = NOT_READY;
			this.retry = () => void this.#start(request);
			return;
		}
		// What is on screen at the turn the passage follows: the buttons the
		// model is asked to add to or prune.
		const before = pathTo(this.index, request.parentId).map((node) => ({
			content: this.content(node.id) ?? null
		}));
		const stopped = isHalted(before);
		this.problem = null;
		this.retry = null;
		this.streaming = { parentId: request.parentId, text: '' };
		this.#controller = new AbortController();
		const { signal } = this.#controller;

		let passage: string;
		let meta: PassageMeta | null = null;
		try {
			const outcome = await writeReply(
				this.id,
				{
					mode: request.mode,
					setup,
					turns: context,
					currentDirections: currentDirections(before),
					...(request.rewrite
						? {
								rewrite: {
									targetText: request.rewrite.target.text,
									...(request.rewrite.quote ? { quote: request.rewrite.quote.text } : {}),
									...(request.rewrite.instruction
										? { instruction: request.rewrite.instruction }
										: {})
								}
							}
						: {})
				},
				{
					signal,
					onText: (soFar) => {
						if (this.streaming) {
							this.streaming = { ...this.streaming, text: soFar };
						}
					}
				}
			);
			if (!outcome.ok) {
				this.streaming = null;
				this.problem = outcome.error;
				this.retry = () => void this.#start(request);
				return;
			}
			({ passage, meta } = outcome);
		} catch {
			// Stopped. What had arrived stays, like a sentence cut off: it is
			// what was on screen, and writing it again is one press away. A Stop
			// the scene or Ease off discards it instead (`#interrupt`).
			passage = (this.streaming?.text ?? '').trim();
			if (!passage || signal.reason === DISCARD) {
				this.streaming = null;
				return;
			}
		} finally {
			this.#controller = null;
		}

		const finalMeta: PassageMeta | undefined =
			meta || stopped || request.rewrite
				? {
						suggestions: stopped ? [] : (meta?.suggestions ?? []),
						directions: stopped
							? { add: [], remove: [] }
							: (meta?.directions ?? { add: [], remove: [] }),
						...(meta?.roll && !stopped ? { roll: meta.roll } : {}),
						...(meta?.readAs ? { readAs: meta.readAs } : {}),
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
			...(finalMeta ? { meta: finalMeta } : {})
		};
		const saved = await this.#append(request.parentId, 'story', content);
		this.streaming = null;
		if (!saved) {
			this.retry = () => void this.#start(request);
		}
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

	/** Another take on a passage: a new turn beside it, which the user is moved to. */
	async writeAgain(turnId: string): Promise<void> {
		const node = this.index.byId.get(turnId);
		if (!node || this.busy) {
			return;
		}
		await this.#settled();
		void this.#start({
			parentId: node.parentId,
			mode: node.parentId === null ? 'opening' : 'reply'
		});
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
		void this.#start({
			parentId: node.parentId,
			mode: 'rewrite',
			rewrite: { target: { id: turnId, text: content.text }, ...options }
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
		const { setup } = this;
		if (!setup) {
			return NOT_READY;
		}
		const limits = setup.limits.trim() ? `${setup.limits.trim()}\n${line}` : line;
		if (limits.length > 1000) {
			return 'Your limits are full. Make room for this one on the setup page.';
		}
		const saved = await this.saveSetup({ ...setup, limits });
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
		const { setup } = this;
		if (setup && setup.dials.intensity > 1) {
			await this.saveSetup({
				...setup,
				dials: { ...setup.dials, intensity: (setup.dials.intensity - 1) as DialValue }
			});
		}
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

	/** Saves a changed setup (the dials, a limit). Answers why not, or null. */
	async saveSetup(setup: DaydreamSetup): Promise<string | null> {
		const saved = await saveSetupRecord(this.id, setup, this.setupRevision);
		if (!saved.ok) {
			return saved.error;
		}
		this.#knownSetup = setup;
		this.setupRevision = saved.revision;
		return null;
	}

	async setDials(dials: StoryDials): Promise<string | null> {
		const { setup } = this;
		return setup ? await this.saveSetup({ ...setup, dials }) : NOT_READY;
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
		const current = this.reactionFor(turnId);
		if (current) {
			const removed = await this.removeMark(current.id);
			if (removed || current.reaction === reaction) {
				return removed;
			}
		}
		return await this.#addMark(turnId, { type: 'reaction', reaction });
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
