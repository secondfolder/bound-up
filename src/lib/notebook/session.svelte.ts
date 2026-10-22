/**
 * One open notebook entry, live: its document, who else is in it, and the
 * sealed traffic that keeps everyone's copy the same.
 *
 * BROWSER ONLY. See docs/notebook.md, "Live editing", for the whole flow.
 * In short:
 *
 * - **Opening** fetches the latest version and every edit after it, opens
 *   each with the entry's vault, and holds them until the editor has bound
 *   itself to the document (`attach`), because the binding only learns a
 *   document from changes it sees happen.
 * - **Writing** batches this page's edits for `FLUSH_MS`, keeps each batch in
 *   the outbox until the server confirms it, and seals and posts it.
 * - **Reading** applies every edit and cursor the room relays, and on any
 *   chance something was missed (a reconnect, the page becoming visible)
 *   fetches every edit after the last one it fetched.
 * - **Versions** are cut by a page that wrote something, once the entry has
 *   been idle for a while (`shouldCutVersion`).
 *
 * Every byte that leaves here is a sealed record; nothing the server or the
 * room relays can be read by either.
 */

import {
	Awareness,
	applyAwarenessUpdate,
	encodeAwarenessUpdate,
	removeAwarenessStates
} from 'y-protocols/awareness';
import { applyUpdate, Doc, encodeStateAsUpdate, mergeUpdates, type Text as YText } from 'yjs';
import { openRecord, sealRecord } from '$lib/crypto/sealed';
import type { OpenVault } from '$lib/crypto/vault';
import { heldVaultIdentity, vaultById, vaultsSettled } from '$lib/crypto/vaults.svelte';
import type { WriteGrant } from '$lib/crypto/write-grant';
import { fromBase64, toBase64 } from '$lib/encryption';
import {
	entryTopic,
	NOTEBOOK_LIMITS,
	type NotebookFrame,
	type SealedEnvelope,
	shouldCutVersion
} from '$lib/notebook';
import { type LiveStatus, type RoomKey, watchRoom } from '$lib/realtime/live';
import { reportRequestFailure, tryFetch } from '$lib/request-failure.svelte';
import type { SealedKind } from '$lib/sealed';
import { type SealScope, writableVault } from '$lib/sealed-forms';
import {
	notebookAwarenessKind,
	notebookEntryKind,
	notebookSnapshotKind,
	notebookUpdateKind
} from '$lib/sealed-kinds/notebook';
import { REMOTE_ORIGIN, TITLE_FIELD } from './collab';
import { type Outbox, openOutbox } from './outbox';

/** How long this page's edits are gathered before they are sent, as one batch. */
const FLUSH_MS = 400;
/** How long after the last change the title and excerpt are rewritten. */
const HEADER_DELAY_MS = 5000;
/** How often the page checks whether a version is due. */
const VERSION_CHECK_MS = 15_000;
const MAX_RETRY_MS = 30_000;

/** The origin edits replayed from the outbox are applied with: local, but already batched. */
const OUTBOX_ORIGIN = 'notebook-outbox';

/** Whether this page's edits have reached the server. */
export type SaveState = 'saved' | 'saving' | 'offline' | 'too-large';

export type SessionPhase = 'loading' | 'ready' | 'failed';

/**
 * Overrides for the version timings, read from `localStorage`. Only the e2e
 * suite sets them, so a test of version history does not wait two minutes.
 */
const TIMINGS_KEY = 'bound-up:notebook-timings';

function readTimings(): { idleMs?: number; maxIntervalMs?: number; checkMs?: number } {
	try {
		const raw = globalThis.localStorage?.getItem(TIMINGS_KEY);
		return raw ? (JSON.parse(raw) as Record<string, number>) : {};
	} catch {
		return {};
	}
}

export type SessionOptions = {
	entryId: string;
	vaultId: string;
	scope: SealScope;
	room: RoomKey;
	userId: string;
	/** What the server said this viewer may do. It re-checks every write regardless. */
	canWrite: boolean;
	headerRevision: number;
	/** The sealed title and excerpt the server has, so a page can tell when they are stale. */
	header: SealedEnvelope | null;
	/** The entry's access changed: the page should reload what it may do. */
	onAccessChanged: () => void;
	/** The entry was deleted, or is no longer this viewer's to read. */
	onGone: () => void;
};

type UpdatesPage = {
	snapshot?: ({ upToSeq: number } & SealedEnvelope) | null;
	updates: ({ seq: number } & SealedEnvelope)[];
	more: boolean;
};

type SessionFlags = {
	/** The editor has bound itself, so fetched edits go straight into the document. */
	attached: boolean;
	destroyed: boolean;
	/** A send loop is running; a second one would post batches twice. */
	sending: boolean;
	/** This page's cursor has moved since it was last sent. */
	awarenessDirty: boolean;
	/** A resync was asked for while one was running, so it runs once more. */
	resyncAgain: boolean;
	/** This page wrote something since the last version, so it may cut the next. */
	editedHereSinceVersion: boolean;
};

export class NotebookSession {
	readonly doc = new Doc();
	readonly awareness = new Awareness(this.doc);
	/** This page's own id, echoed in its frames so it can skip them. */
	readonly origin = crypto.randomUUID();

	phase = $state<SessionPhase>('loading');
	/** Why the entry could not be opened, worded for the person, with no content in it. */
	failure = $state<string | null>(null);
	saveState = $state<SaveState>('saved');
	live = $state<LiveStatus>('connecting');
	/** Whether this page may write: the server's answer, narrowed by this device's vault. */
	canWrite = $state(false);
	/** Why this device cannot write when the server says it may. */
	writeBlocked = $state<string | null>(null);
	/** The users with this entry open elsewhere, one entry per open page. */
	peers = $state<string[]>([]);
	/** Bumped whenever a version is cut, here or elsewhere, so the history can refresh. */
	versionsChanged = $state(0);

	readonly #options: SessionOptions;
	/**
	 * Where this page has got to. In one object rather than six fields, and
	 * typed by `SessionFlags`, because Biome's inference reads a class field's
	 * initial `false` as its only value and reports every check of one as
	 * always falsy; a property of a typed object it reads as a boolean.
	 */
	readonly #is: SessionFlags = {
		attached: false,
		destroyed: false,
		sending: false,
		awarenessDirty: false,
		resyncAgain: false,
		editedHereSinceVersion: false
	};
	readonly #timings = readTimings();
	#vault: OpenVault | null = null;
	#grant: WriteGrant | null = null;
	#outbox: Outbox | null = null;
	/** What was fetched or relayed before the editor bound itself. */
	#early: Uint8Array[] = [];

	/** This page's edits not yet in a batch. */
	#queued: Uint8Array[] = [];
	#flushTimer: ReturnType<typeof setTimeout> | undefined;
	#retryMs = 0;
	#retryTimer: ReturnType<typeof setTimeout> | undefined;

	/** Every stored edit up to this seq has been applied here. */
	#fetchedThrough = 0;
	#resyncing: Promise<void> | null = null;
	/** Frames are opened in order, one at a time, so a cursor never lands before its text. */
	#frames: Promise<void> = Promise.resolve();

	#lastEditAt: number | null = null;
	#lastVersionAt = Date.now();
	#versionTimer: ReturnType<typeof setInterval> | undefined;

	#headerRevision: number;
	#headerTimer: ReturnType<typeof setTimeout> | undefined;
	#lastHeader = '';
	#excerpt: (() => string) | null = null;

	#stopWatching: (() => void) | null = null;

	constructor(options: SessionOptions) {
		this.#options = options;
		this.#headerRevision = options.headerRevision;
		this.doc.on('update', this.#onDocUpdate);
		this.awareness.on('update', this.#onAwarenessUpdate);
		this.awareness.on('change', this.#onAwarenessChange);
	}

	/** The title, as a shared text the title field binds to. */
	get title(): YText {
		return this.doc.getText(TITLE_FIELD);
	}

	/** Where the list's excerpt comes from: the editor's text, which only the editor has. */
	setExcerptSource(source: () => string): void {
		this.#excerpt = source;
	}

	/** Fetches and opens the entry, and starts listening. Resolves once it is ready to attach. */
	async open(): Promise<void> {
		const { entryId, vaultId, scope, room } = this.#options;
		await vaultsSettled();
		const vault = vaultById(vaultId);
		if (!vault) {
			this.#fail(
				vault === undefined
					? 'This page is still getting ready. Reload it to try again.'
					: 'This entry can’t be opened on this device. Signing out and in again usually fixes it.'
			);
			return;
		}
		this.#vault = vault;

		// Asked for a reader too: a cursor is sealed like an edit, and the trust
		// check that guards writing into a partnership's vault guards it as well.
		const writable = await writableVault(scope);
		if (typeof writable === 'string') {
			if (this.#options.canWrite) {
				this.writeBlocked = writable;
			}
		} else {
			this.#grant = writable.grant;
			this.canWrite = this.#options.canWrite;
		}

		this.#outbox = await openOutbox(entryId, heldVaultIdentity());

		const stored = this.#options.header
			? await this.#open(notebookEntryKind, this.#options.header)
			: null;
		if (stored) {
			this.#lastHeader = JSON.stringify({ title: stored.title, excerpt: stored.excerpt });
		}

		// Listening starts before the first fetch, so nothing published between
		// the two can fall into the gap; anything relayed twice is harmless.
		this.#stopWatching = watchRoom({
			room,
			topics: [entryTopic(entryId)],
			onFrame: (_topic, data) => this.#onFrame(data),
			onResync: () => void this.resync(),
			onStatus: (status) => {
				this.live = status;
			}
		});

		const opened = await this.#fetch(0, true);
		if (!opened) {
			return;
		}
		this.phase = 'ready';
		this.#versionTimer = setInterval(
			() => void this.#maybeCutVersion(),
			this.#timings.checkMs ?? VERSION_CHECK_MS
		);
		document.addEventListener('visibilitychange', this.#onVisibility);
		window.addEventListener('pagehide', this.#onPageHide);
		globalThis.addEventListener('online', this.#onOnline);
	}

	/**
	 * Applies what was fetched, now that the editor is bound, then whatever
	 * this device still had waiting to send, which goes out again.
	 */
	attach(): void {
		if (this.#is.attached) {
			return;
		}
		this.#is.attached = true;
		if (this.#early.length > 0) {
			applyUpdate(this.doc, mergeUpdates(this.#early), REMOTE_ORIGIN);
			this.#early = [];
		}
		const waiting = this.#outbox?.pending() ?? [];
		if (waiting.length > 0) {
			applyUpdate(
				this.doc,
				mergeUpdates(waiting.map((batch) => fromBase64(batch.update))),
				OUTBOX_ORIGIN
			);
			if (this.canWrite) {
				this.saveState = 'saving';
				void this.#send();
			}
		}
		// The header is a cache of the document, and a page that closed before
		// writing it leaves it stale; whoever opens the entry next with the right
		// to write puts that right, once the editor has its text.
		if (this.canWrite) {
			this.#scheduleHeader();
		}
	}

	/** Sends everything queued now, and resolves once the outbox is empty or sending has stalled. */
	async flushNow(): Promise<void> {
		this.#batch();
		await this.#send();
	}

	/**
	 * Fetches every edit after the last one fetched. Called on anything that
	 * might mean frames were missed; runs one at a time, and once more if
	 * asked again while running.
	 */
	resync(): Promise<void> {
		if (this.phase !== 'ready') {
			return Promise.resolve();
		}
		if (this.#resyncing !== null) {
			this.#is.resyncAgain = true;
			return this.#resyncing;
		}
		this.#resyncing = (async () => {
			do {
				this.#is.resyncAgain = false;
				await this.#fetch(this.#fetchedThrough, false);
			} while (this.#is.resyncAgain && !this.#is.destroyed);
			this.#resyncing = null;
		})();
		return this.#resyncing;
	}

	/**
	 * Cuts a version now: everything stored up to the last fetched edit, plus
	 * whatever this page has on top. `restoredFromVersionId` marks one cut by
	 * a restore.
	 */
	async cutVersion(restoredFromVersionId: string | null = null): Promise<boolean> {
		const vault = this.#vault;
		const grant = this.#grant;
		if (!(vault && grant && this.canWrite)) {
			return false;
		}
		// Everything up to a seq must be in the snapshot that claims it.
		await this.resync();
		const upToSeq = this.#fetchedThrough;
		if (upToSeq === 0) {
			return false;
		}
		const id = crypto.randomUUID();
		const state = toBase64(encodeStateAsUpdate(this.doc));
		let sealed: { ciphertext: string; payloadVersion: number };
		try {
			sealed = await sealRecord(notebookSnapshotKind, {
				recordId: id,
				payload: { state },
				vault,
				grant
			});
		} catch (problem) {
			console.error('[notebook] could not seal a version', problem);
			return false;
		}
		const response = await tryFetch(this.#path('versions'), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id, upToSeq, restoredFromVersionId, vaultId: vault.id, ...sealed })
		});
		// Background work: a version that did not get cut is cut next time.
		if (!response?.ok) {
			return false;
		}
		this.#versionCut();
		return true;
	}

	/** Opens one version's snapshot, for a preview or a restore. Null if it will not open. */
	async openVersion(versionId: string): Promise<Uint8Array | null> {
		const vault = this.#vault;
		if (!vault) {
			return null;
		}
		const response = await tryFetch(this.#path(`versions/${versionId}`));
		if (!response?.ok) {
			reportRequestFailure(response);
			return null;
		}
		const body = (await response.json()) as SealedEnvelope;
		const opened = await this.#open(notebookSnapshotKind, { ...body, id: versionId });
		return opened ? fromBase64(opened.state) : null;
	}

	/** Stops everything. Sends what it can on the way out. */
	destroy(): void {
		if (this.#is.destroyed) {
			return;
		}
		this.#is.destroyed = true;
		this.#batch();
		void this.#send();
		void this.#saveHeader();
		clearTimeout(this.#flushTimer);
		clearTimeout(this.#retryTimer);
		clearTimeout(this.#headerTimer);
		clearInterval(this.#versionTimer);
		document.removeEventListener('visibilitychange', this.#onVisibility);
		window.removeEventListener('pagehide', this.#onPageHide);
		globalThis.removeEventListener('online', this.#onOnline);
		// Tell the others this page has gone, so its caret goes at once rather
		// than after the awareness timeout.
		removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
		this.#stopWatching?.();
		this.awareness.destroy();
	}

	/**
	 * Calls back into the page, unless this session has been torn down. A
	 * send made on the way out can still be answered after the page has gone,
	 * and its callbacks would then read state belonging to a destroyed
	 * component.
	 */
	#tell(callback: 'onGone' | 'onAccessChanged'): void {
		if (!this.#is.destroyed) {
			this.#options[callback]();
		}
	}

	// ── reading ──────────────────────────────────────────────────────────────

	#path(rest: string): string {
		return `/api/notebook/entries/${this.#options.entryId}/${rest}`;
	}

	async #open<Latest>(kind: SealedKind<Latest>, envelope: SealedEnvelope): Promise<Latest | null> {
		const vault = this.#vault;
		if (!vault || envelope.vaultId !== vault.id) {
			return null;
		}
		return await openRecord(kind, {
			recordId: envelope.id,
			ciphertext: envelope.ciphertext,
			payloadVersion: envelope.payloadVersion,
			vault
		});
	}

	#apply(update: Uint8Array): void {
		if (this.#is.attached) {
			applyUpdate(this.doc, update, REMOTE_ORIGIN);
		} else {
			this.#early.push(update);
		}
	}

	/** Fetches pages of edits after `after`, opening and applying each. False if it failed. */
	async #fetch(after: number, opening: boolean): Promise<boolean> {
		let cursor = after;
		let first = opening;
		for (;;) {
			const response = await tryFetch(
				this.#path(`updates?after=${cursor}${first ? '&snapshot=1' : ''}`)
			);
			if (this.#is.destroyed) {
				return false;
			}
			if (!response?.ok) {
				if (response?.status === 404) {
					this.#tell('onGone');
					return false;
				}
				if (opening) {
					this.#fail(
						response === null
							? 'This entry couldn’t be loaded: you look to be offline. Reload the page once you’re connected.'
							: 'This entry couldn’t be loaded. Reload the page to try again.'
					);
				}
				return false;
			}
			const page = (await response.json()) as UpdatesPage;
			if (page.snapshot) {
				const snapshot = await this.#open(notebookSnapshotKind, page.snapshot);
				if (!snapshot) {
					this.#unreadable();
					return false;
				}
				this.#apply(fromBase64(snapshot.state));
				cursor = Math.max(cursor, page.snapshot.upToSeq);
			}
			for (const stored of page.updates) {
				const update = await this.#open(notebookUpdateKind, stored);
				if (!update) {
					if (opening) {
						this.#unreadable();
						return false;
					}
					// A single edit that will not open, mid-session, is skipped: the
					// next version made by a device that could open it carries it.
					console.error('[notebook] an edit would not open on this device', { seq: stored.seq });
					continue;
				}
				this.#apply(fromBase64(update.update));
				cursor = Math.max(cursor, stored.seq);
			}
			this.#fetchedThrough = Math.max(this.#fetchedThrough, cursor);
			first = false;
			if (!page.more) {
				return true;
			}
		}
	}

	#unreadable(): void {
		// No content in the message, and a way out that loses nothing: what is
		// stored stays stored, and this device simply cannot open it yet.
		this.#fail(
			'Part of this entry can’t be opened on this device. Nothing has been lost: try signing out and in again, or open it on another device.'
		);
	}

	#fail(message: string): void {
		this.phase = 'failed';
		this.failure = message;
		this.#stopWatching?.();
		this.#stopWatching = null;
	}

	#onFrame(data: string): void {
		let frame: NotebookFrame;
		try {
			frame = JSON.parse(data) as NotebookFrame;
		} catch {
			return;
		}
		this.#frames = this.#frames.then(() => this.#handleFrame(frame)).catch(() => undefined);
	}

	async #handleFrame(frame: NotebookFrame): Promise<void> {
		switch (frame.type) {
			case 'update': {
				if (frame.origin === this.origin) {
					return;
				}
				const update = await this.#open(notebookUpdateKind, frame);
				if (update) {
					this.#lastEditAt = Date.now();
					this.#apply(fromBase64(update.update));
				}
				return;
			}
			case 'awareness': {
				if (frame.origin === this.origin) {
					return;
				}
				const awareness = await this.#open(notebookAwarenessKind, frame);
				if (awareness) {
					const known = new Set(this.awareness.getStates().keys());
					applyAwarenessUpdate(this.awareness, fromBase64(awareness.state), 'remote');
					// Someone new has opened the entry. They missed every cursor sent
					// before they arrived, so this page says where it is again, rather
					// than leaving them blind to it until the next heartbeat. They do
					// the same on hearing this, and it stops there: by then each
					// already knows the other.
					if ([...this.awareness.getStates().keys()].some((id) => !known.has(id))) {
						this.#is.awarenessDirty = true;
						this.#scheduleFlush();
					}
				}
				return;
			}
			case 'version':
				this.#versionCut();
				return;
			case 'access':
				this.#tell('onAccessChanged');
				return;
			case 'deleted':
				this.#tell('onGone');
				return;
			default:
				return;
		}
	}

	readonly #onAwarenessChange = (): void => {
		const peers: string[] = [];
		for (const [clientId, state] of this.awareness.getStates()) {
			if (clientId === this.doc.clientID) {
				continue;
			}
			const userId = (state as { awarenessData?: { userId?: unknown } }).awarenessData?.userId;
			if (typeof userId === 'string') {
				peers.push(userId);
			}
		}
		this.peers = peers;
	};

	// ── writing ──────────────────────────────────────────────────────────────

	readonly #onDocUpdate = (update: Uint8Array, origin: unknown): void => {
		if (origin === REMOTE_ORIGIN || origin === OUTBOX_ORIGIN) {
			return;
		}
		if (!this.canWrite) {
			// A reader's editor is not editable, so this is only ever something
			// the binding normalised on load. It is not this viewer's to send.
			return;
		}
		this.#queued.push(update);
		this.#lastEditAt = Date.now();
		this.#is.editedHereSinceVersion = true;
		this.saveState = 'saving';
		this.#scheduleFlush();
		this.#scheduleHeader();
	};

	readonly #onAwarenessUpdate = (
		{ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
		origin: unknown
	): void => {
		if (origin !== 'local') {
			return;
		}
		const changed = [...added, ...updated, ...removed];
		if (!changed.includes(this.doc.clientID)) {
			return;
		}
		this.#is.awarenessDirty = true;
		this.#scheduleFlush();
	};

	#scheduleFlush(): void {
		if (this.#flushTimer || this.#is.destroyed) {
			return;
		}
		this.#flushTimer = setTimeout(() => {
			this.#flushTimer = undefined;
			this.#batch();
			void this.#send();
		}, FLUSH_MS);
	}

	/** Turns what is queued into one batch in the outbox. */
	#batch(): void {
		if (this.#queued.length === 0) {
			return;
		}
		const merged = mergeUpdates(this.#queued);
		this.#queued = [];
		this.#outbox?.add({ id: crypto.randomUUID(), update: toBase64(merged) });
	}

	/** The cursor, sealed, if it has changed since it was last sent. */
	async #sealedAwareness(): Promise<SealedEnvelope | null> {
		const vault = this.#vault;
		const grant = this.#grant;
		if (!(this.#is.awarenessDirty && vault && grant)) {
			return null;
		}
		this.#is.awarenessDirty = false;
		const id = crypto.randomUUID();
		const state = toBase64(encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
		try {
			const sealed = await sealRecord(notebookAwarenessKind, {
				recordId: id,
				payload: { state },
				vault,
				grant
			});
			return { id, vaultId: vault.id, ...sealed };
		} catch {
			return null;
		}
	}

	/**
	 * Sends the outbox, oldest first, one request at a time, with the cursor
	 * riding on the first. Stops on a failure and retries with backoff; a
	 * batch leaves the outbox only once the server has stored it.
	 */
	async #send(): Promise<void> {
		if (this.#is.sending || !this.#vault) {
			return;
		}
		this.#is.sending = true;
		try {
			for (;;) {
				const [batch] = this.canWrite ? (this.#outbox?.pending() ?? []) : [];
				const awareness = await this.#sealedAwareness();
				if (!(batch || awareness)) {
					break;
				}
				const update = batch ? await this.#sealUpdate(batch.id, batch.update) : null;
				if (batch && !update) {
					this.saveState = 'too-large';
					break;
				}
				const response = await tryFetch(this.#path('updates'), {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						origin: this.origin,
						...(update ? { update } : {}),
						...(awareness ? { awareness } : {})
					})
				});
				if (response?.ok) {
					this.#retryMs = 0;
					if (batch) {
						this.#outbox?.confirm(batch.id);
					}
					continue;
				}
				if (response?.status === 403) {
					// Made read-only while typing. What was typed stays in the outbox
					// on this device, and the page reloads what it may do.
					this.canWrite = false;
					this.#tell('onAccessChanged');
					break;
				}
				if (response?.status === 404) {
					this.#tell('onGone');
					break;
				}
				if (awareness && !batch) {
					// A lost cursor is not worth retrying: the next move sends another.
					break;
				}
				this.saveState = 'offline';
				this.#retryMs = Math.min(Math.max(this.#retryMs * 2, 1000), MAX_RETRY_MS);
				clearTimeout(this.#retryTimer);
				this.#retryTimer = setTimeout(() => void this.#send(), this.#retryMs);
				return;
			}
		} finally {
			this.#is.sending = false;
		}
		if (this.saveState !== 'too-large' && (this.#outbox?.pending().length ?? 0) === 0) {
			this.saveState = this.#queued.length > 0 ? 'saving' : 'saved';
		}
	}

	async #sealUpdate(id: string, update: string): Promise<SealedEnvelope | null> {
		const vault = this.#vault;
		const grant = this.#grant;
		if (!(vault && grant)) {
			return null;
		}
		try {
			const sealed = await sealRecord(notebookUpdateKind, {
				recordId: id,
				payload: { update },
				vault,
				grant
			});
			return { id, vaultId: vault.id, ...sealed };
		} catch (problem) {
			// Over the cap: one paste larger than a batch may be. It stays in the
			// outbox, so it is not lost, and the page says what to do.
			console.error('[notebook] could not seal an edit', problem);
			return null;
		}
	}

	// ── the header ───────────────────────────────────────────────────────────

	#scheduleHeader(): void {
		clearTimeout(this.#headerTimer);
		this.#headerTimer = setTimeout(() => void this.#saveHeader(), HEADER_DELAY_MS);
	}

	async #saveHeader(retried = false): Promise<void> {
		const vault = this.#vault;
		const grant = this.#grant;
		if (!(vault && grant && this.canWrite)) {
			return;
		}
		const header = {
			title: this.title.toString().trim().slice(0, NOTEBOOK_LIMITS.title),
			excerpt: (this.#excerpt?.() ?? '')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, NOTEBOOK_LIMITS.excerpt)
		};
		const key = JSON.stringify(header);
		if (key === this.#lastHeader) {
			return;
		}
		const sealed = await sealRecord(notebookEntryKind, {
			recordId: this.#options.entryId,
			payload: header,
			vault,
			grant
		});
		const response = await tryFetch(this.#path('header'), {
			method: 'POST',
			// Small enough to outlive the page, which is often when this is sent.
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				vaultId: vault.id,
				...sealed,
				expectedRevision: this.#headerRevision
			})
		});
		if (response?.ok) {
			this.#headerRevision = ((await response.json()) as { revision: number }).revision;
			this.#lastHeader = key;
			return;
		}
		if (response?.status === 409 && !retried) {
			// Another page wrote it first. This one is still editing, so its copy
			// is at least as new; write once more over the revision it reported.
			this.#headerRevision = ((await response.json()) as { revision: number }).revision;
			await this.#saveHeader(true);
		}
		// Anything else is background work nobody is waiting on: the next edit
		// tries again.
	}

	// ── versions ─────────────────────────────────────────────────────────────

	#versionCut(): void {
		this.#lastVersionAt = Date.now();
		this.#is.editedHereSinceVersion = false;
		this.#lastEditAt = null;
		this.versionsChanged += 1;
	}

	async #maybeCutVersion(): Promise<void> {
		if (
			!(this.canWrite && this.#is.editedHereSinceVersion) ||
			this.#outbox?.pending().length ||
			!shouldCutVersion({
				lastEditAt: this.#lastEditAt,
				lastVersionAt: this.#lastVersionAt,
				now: Date.now(),
				idleMs: this.#timings.idleMs,
				maxIntervalMs: this.#timings.maxIntervalMs
			})
		) {
			return;
		}
		await this.cutVersion();
	}

	/**
	 * The page is going: a reload, a link out, the tab closing. What is queued
	 * goes into the outbox, which a reload then sends, and the title goes now,
	 * with `keepalive`, since nothing else will send it before next time.
	 */
	/**
	 * Back online: send what is waiting now, rather than when the backoff
	 * next comes round. Offline for a while, that had grown to its 30 second
	 * cap, so an entry written on a train sat unsent for up to half a minute
	 * after the connection came back, saying "Offline" all the while.
	 */
	readonly #onOnline = (): void => {
		if (this.saveState !== 'offline') {
			return;
		}
		clearTimeout(this.#retryTimer);
		this.#retryMs = 0;
		void this.#send();
	};

	readonly #onPageHide = (): void => {
		this.#batch();
		void this.#saveHeader();
	};

	readonly #onVisibility = (): void => {
		if (document.visibilityState === 'hidden') {
			// Leaving the page is the end of a sitting as surely as two idle
			// minutes are; the request may or may not finish before the tab
			// sleeps, and the next sitting cuts it if not.
			this.#batch();
			void this.#send().then(() => {
				if (this.#is.editedHereSinceVersion) {
					void this.cutVersion();
				}
			});
			void this.#saveHeader();
		}
	};
}
