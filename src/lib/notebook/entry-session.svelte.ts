import { currentKeyring } from '$lib/crypto/session.svelte';
import type { RoomKey } from '$lib/realtime/live';
import type { SealScope } from '$lib/sealed-forms';
import type { SealedRefView } from '$lib/types';
import { loadNotebookEditor } from './load';
import type { NotebookSession } from './session.svelte';

export type NotebookEditorModules = Awaited<ReturnType<typeof loadNotebookEditor>>;

export type EntrySessionOptions = {
	entryId: string;
	vaultId: string;
	canWrite: boolean;
	room: RoomKey;
	viewerId: string;
	sealScope: SealScope;
	/** The header's revision as loaded: the session keeps its own count from here. */
	revision: number;
	header: SealedRefView | null;
	/** What this viewer may do changed: reload it. */
	onAccessChanged: () => void;
	/** The entry is gone or no longer readable. */
	onGone: () => void;
};

/**
 * An entry's live session, for a page that shows it: the entry's own page,
 * and a scene menu's (docs/scenes.md, "A menu's own page"). Loads the live
 * pieces in the browser (`loadNotebookEditor`) and opens a `NotebookSession`
 * once the keyring is open. Call it while a component initialises.
 *
 * Rebuilt for a different entry, vault or room, or a change in whether
 * this viewer may write, and also whenever the load refreshes, because the
 * header and its revision are read from the entry as loaded; unsent edits
 * survive that in the outbox. The rebuild on a refresh is how the entry page
 * has always behaved, and it is kept on purpose: reading the rest once
 * instead left a scene's editor empty after its access was changed (the
 * menu page spec in e2e/scenes.spec.ts), for a reason not yet pinned down.
 */
export function entrySession(options: () => EntrySessionOptions): {
	readonly live: NotebookEditorModules | null;
	readonly session: NotebookSession | null;
} {
	let live = $state.raw<NotebookEditorModules | null>(null);
	let session = $state<NotebookSession | null>(null);

	const entryId = $derived(options().entryId);
	const vaultId = $derived(options().vaultId);
	const canWrite = $derived(options().canWrite);
	const roomKey = $derived(options().room);

	// A keyring that is not open renders the placeholder, never content
	// (AGENTS.md), and an entry cannot be opened without it anyway.
	const unlocked = $derived(currentKeyring().status === 'unlocked');

	$effect(() => {
		void loadNotebookEditor().then((loaded) => {
			live = loaded;
		});
	});

	$effect(() => {
		const modules = live;
		if (!(unlocked && modules)) {
			return;
		}
		const { viewerId, sealScope, revision, header, onAccessChanged, onGone } = options();
		const created = new modules.NotebookSession({
			entryId,
			vaultId,
			scope: sealScope,
			room: roomKey,
			userId: viewerId,
			canWrite,
			headerRevision: revision,
			header: header
				? {
						id: header.recordId,
						vaultId: header.vaultId,
						ciphertext: header.ciphertext,
						payloadVersion: header.payloadVersion
					}
				: null,
			onAccessChanged,
			onGone
		});
		session = created;
		void created.open();
		return () => {
			created.destroy();
			if (session === created) {
				session = null;
			}
		};
	});

	return {
		get live() {
			return live;
		},
		get session() {
			return session;
		}
	};
}
