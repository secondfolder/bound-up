/**
 * The notebook's rules: who may read, write and restrict an entry, when a
 * version is cut, what may be compacted, and how the journal is grouped.
 *
 * Alias-free and pure, like `partnership.ts`, so the Drizzle schema can take
 * its types and every rule is tested without a database. The server enforces
 * these; the screens only use them to decide what to show. See
 * docs/notebook.md.
 */

import type { SpaceMember } from './spaces';

/**
 * Journal entries are dated; notes are free pages; scenes are plans for play,
 * with the scene designer's prompts beside them (docs/scenes.md). Otherwise
 * they are the same thing.
 */
export type NotebookKind = 'journal' | 'note' | 'scene';

export const NOTEBOOK_KINDS: readonly NotebookKind[] = ['journal', 'note', 'scene'];

export function isNotebookKind(value: unknown): value is NotebookKind {
	return value === 'journal' || value === 'note' || value === 'scene';
}

/**
 * What a partnership entry allows every member other than the one who set
 * it.
 *
 * `edit` is the default: a shared notebook both people write in. A member who
 * manages the space may make an entry `read` only, or `hidden`, for the
 * others. Hidden is withheld by the server, not by cryptography: the other
 * partner holds the partnership vault's key. Partners are trusted, and the
 * doc says so plainly.
 */
export type PartnerAccess = 'edit' | 'read' | 'hidden';

export const PARTNER_ACCESS: readonly PartnerAccess[] = ['edit', 'read', 'hidden'];

export function isPartnerAccess(value: unknown): value is PartnerAccess {
	return value === 'edit' || value === 'read' || value === 'hidden';
}

/** What one viewer may do with one entry. */
export type EntryAccess = 'edit' | 'read' | 'none';

/** An entry as the rules need it. */
export type EntryForAccess =
	| { scope: 'self'; ownerId: string }
	| {
			scope: 'partnership';
			partnerAccess: PartnerAccess;
			/** Who restricted it; the restriction applies to every other member. */
			accessSetByUserId: string | null;
			/**
			 * Who wrote it first. When more than one member manages the space,
			 * only they may restrict it; null once their account is gone.
			 */
			createdByUserId: string | null;
	  };

/**
 * A shared space as the rules need it: its members, and which of them manage
 * it (`space_members.can_manage`). Never the partnership's `control`, which
 * is only the invite's offer (docs/partners.md).
 */
export type SpaceForAccess = { members: readonly SpaceMember[] };

function isMember(space: SpaceForAccess, userId: string): boolean {
	return space.members.some((member) => member.userId === userId);
}

/** Whether `userId` manages the space: the "control" the copy talks about. */
export function holdsControl(space: SpaceForAccess, userId: string): boolean {
	return space.members.some((member) => member.userId === userId && member.canManage);
}

/** Whether more than one member manages the space: control shared, in the copy's words. */
function sayIsShared(space: SpaceForAccess): boolean {
	return space.members.filter((member) => member.canManage).length > 1;
}

/**
 * What `viewerId` may do with `entry`.
 *
 * A partnership entry needs `space` (the accepted partnership's space it
 * belongs to), and anyone who is not a member of it gets `none`. The
 * restriction binds every member but the one who set it: the member who
 * restricted an entry can always still edit it.
 */
export function entryAccessFor(
	entry: EntryForAccess,
	viewerId: string,
	space?: SpaceForAccess
): EntryAccess {
	if (entry.scope === 'self') {
		return entry.ownerId === viewerId ? 'edit' : 'none';
	}
	if (!(space && isMember(space, viewerId))) {
		return 'none';
	}
	if (entry.partnerAccess === 'edit' || entry.accessSetByUserId === viewerId) {
		return 'edit';
	}
	return entry.partnerAccess === 'read' ? 'read' : 'none';
}

/**
 * Whether `userId` is the member who decides who else may see or edit
 * `entry`: a member who manages the space, or, when more than one does
 * (control shared), the member who created the entry.
 *
 * Shared control used to let either member restrict any entry, and the other
 * could not undo it, so two people who had agreed to share control could
 * each hide the other's writing from them. Giving the say to the creator
 * keeps "it's mine, so I choose" without that. An entry whose creator has
 * deleted their account falls back to either member, so it never has nobody
 * who can lift a restriction on it.
 */
export function holdsAccessAuthority(
	entry: Extract<EntryForAccess, { scope: 'partnership' }>,
	userId: string,
	space: SpaceForAccess
): boolean {
	if (!holdsControl(space, userId)) {
		return false;
	}
	// The creator's say needs the creator still to be here to use it.
	if (
		!sayIsShared(space) ||
		entry.createdByUserId === null ||
		!isMember(space, entry.createdByUserId)
	) {
		return true;
	}
	return entry.createdByUserId === userId;
}

/**
 * Whether `viewerId` may change a partnership entry's access.
 *
 * The viewer needs the say themselves (`holdsAccessAuthority`). A
 * restriction somebody else set also binds them for as long as its setter
 * still has the say; once the say has moved, the member who has it now may
 * lift it, so handing control over never leaves anyone locked out of their
 * own partnership's notebook. That is also what frees an entry a non-creator
 * restricted under shared control from before only the creator could.
 */
export function canSetAccess(
	entry: Extract<EntryForAccess, { scope: 'partnership' }>,
	viewerId: string,
	space: SpaceForAccess
): boolean {
	if (!holdsAccessAuthority(entry, viewerId, space)) {
		return false;
	}
	const restrictedByOther =
		entry.partnerAccess !== 'edit' &&
		entry.accessSetByUserId !== null &&
		entry.accessSetByUserId !== viewerId;
	if (!restrictedByOther) {
		return true;
	}
	return !holdsAccessAuthority(entry, entry.accessSetByUserId as string, space);
}

/**
 * Whether `userId` may move `entry` to another space (docs/notebook.md,
 * "Moving an entry"): its owner, for a solo entry; for a shared one, the
 * member who may change who else sees it (`canSetAccess`), since taking it
 * out of the space takes it from everyone else in it, which is hiding it
 * with no way back. Where it may go is checked separately: any space the
 * viewer is a member of and can write into.
 */
export function canMoveEntry(
	entry: EntryForAccess,
	userId: string,
	space?: SpaceForAccess
): boolean {
	if (entry.scope === 'self') {
		return entry.ownerId === userId;
	}
	return space !== undefined && canSetAccess(entry, userId, space);
}

/** Whether `access` lets its holder write. */
export function canWrite(access: EntryAccess): boolean {
	return access === 'edit';
}

/** Whether `access` lets its holder read at all. */
export function canRead(access: EntryAccess): boolean {
	return access !== 'none';
}

/**
 * When a client cuts an automatic version.
 *
 * Like a document editor's history: one version per sitting rather than one
 * per keystroke. A sitting ends after `VERSION_IDLE_MS` without an edit, and a
 * very long one is split every `VERSION_MAX_INTERVAL_MS`, so a whole
 * afternoon is never a single step back.
 */
export const VERSION_IDLE_MS = 2 * 60 * 1000;
export const VERSION_MAX_INTERVAL_MS = 30 * 60 * 1000;

export type VersionClock = {
	/** When this device last saw an edit, from anyone. Null for none since the last version. */
	lastEditAt: number | null;
	/** When the latest version was cut, or the entry created. */
	lastVersionAt: number;
	now: number;
	/** Overrides, for the e2e suite only: see `notebookTimings`. */
	idleMs?: number;
	maxIntervalMs?: number;
};

export function shouldCutVersion(clock: VersionClock): boolean {
	if (clock.lastEditAt === null) {
		return false;
	}
	const idle = clock.idleMs ?? VERSION_IDLE_MS;
	const max = clock.maxIntervalMs ?? VERSION_MAX_INTERVAL_MS;
	return clock.now - clock.lastEditAt >= idle || clock.now - clock.lastVersionAt >= max;
}

/**
 * Up to which `seq` stored edits may be deleted, given the entry's versions.
 *
 * Not the newest version's: the one before it. A version is a snapshot a
 * client made, and the server cannot check it, so a buggy one must not take
 * the edits that would rebuild the document with it. Keeping one version's
 * worth means the previous snapshot plus every edit after it can always
 * rebuild the entry. Null while there is nothing safe to delete.
 */
export function compactionBound(upToSeqs: readonly number[]): number | null {
	const sorted = [...upToSeqs].sort((a, b) => b - a);
	return sorted[1] ?? null;
}

/** A journal entry's date, `YYYY-MM-DD`. */
export const ENTRY_DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

export function isEntryDate(value: unknown): value is string {
	return typeof value === 'string' && ENTRY_DATE_PATTERN.test(value);
}

/** Groups journal entries by month, newest month first, keeping each month's order. */
export function groupByMonth<T extends { entryDate: string | null }>(
	entries: readonly T[]
): { month: string; entries: T[] }[] {
	const groups: { month: string; entries: T[] }[] = [];
	for (const entry of entries) {
		const month = entry.entryDate?.slice(0, 7) ?? '';
		const last = groups.at(-1);
		if (last?.month === month) {
			last.entries.push(entry);
		} else {
			groups.push({ month, entries: [entry] });
		}
	}
	return groups;
}

/**
 * The size limits. Ciphertext lengths are what the server can check; the
 * visible-text limit is checked in the browser, the only place the text is.
 */
export const NOTEBOOK_LIMITS = {
	/** One batch of edits. A larger paste is split; see `splitUpdate`. */
	updateCiphertext: 256 * 1024,
	/** One device's cursor and presence. */
	awarenessCiphertext: 8 * 1024,
	/** The title and list excerpt. */
	headerCiphertext: 4 * 1024,
	/** A whole document at one point in time. */
	snapshotCiphertext: 4 * 1024 * 1024,
	/** Visible characters in one entry, counted with `documentToPlainText`. */
	visibleText: 100_000,
	/** Characters in a title. */
	title: 200,
	/** Characters in the list excerpt. */
	excerpt: 300
} as const;

/** The realtime topic an entry's edits and cursors travel on. */
export function entryTopic(entryId: string): string {
	return `notebook-entry:${entryId}`;
}

/** The realtime topic for "the list of entries changed". */
export const NOTEBOOK_LIST_TOPIC = 'notebook';

/** A sealed record as a frame or a response carries it. */
export type SealedEnvelope = {
	id: string;
	vaultId: string;
	payloadVersion: number;
	ciphertext: string;
};

/**
 * What travels on an entry's topic (`entryTopic`). Edits and cursors are
 * sealed; the rest says only that something happened, and the page refetches
 * through its normal, authorised path. See docs/notebook.md, "Live editing".
 *
 * `origin` is the sending page's own random id, so it can skip its own echo.
 */
export type NotebookFrame =
	| ({ type: 'update'; origin: string; seq: number } & SealedEnvelope)
	| ({ type: 'awareness'; origin: string } & SealedEnvelope)
	| { type: 'version'; id: string; upToSeq: number }
	| { type: 'access' }
	/** It is in another space now, sealed under that space's vault: reload it. */
	| { type: 'moved' }
	| { type: 'deleted' };

/** What travels on the list topic: that something changed, and nothing about what. */
export type NotebookListFrame = { kind: 'changed' };
