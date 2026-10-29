/**
 * What the server hands a page about the new engine's daydreams: the plain
 * envelope and the sealed records, which the page opens. Pure and
 * alias-free, so components and the server share them without the page
 * importing `$lib/server`.
 */

import type { SealedRefView } from '../types';

export type DreamTurnRole = 'user' | 'model';

export type DreamListItemView = {
	id: string;
	setup: SealedRefView;
	lastTurnAt: Date | null;
	createdAt: Date;
};

/** A turn's place in the tree, without its content. */
export type DreamTreeNodeView = {
	id: string;
	parentId: string | null;
	role: DreamTurnRole;
	depth: number;
	createdAt: Date;
};

export type DreamTurnView = DreamTreeNodeView & { sealed: SealedRefView };

/** Detail or a summary, by the turn it belongs to. */
export type DreamNoteView = { id: string; turnId: string; createdAt: Date; sealed: SealedRefView };

export type DreamView = {
	id: string;
	revision: number;
	setup: SealedRefView;
	activeTurnId: string | null;
	/** The whole tree's shape, oldest first. */
	tree: DreamTreeNodeView[];
	/** The branch being read, opening first, with content. */
	path: DreamTurnView[];
	/** Detail and summaries on the branch being read. */
	details: DreamNoteView[];
	summaries: DreamNoteView[];
};

export type DreamPreferencesView = { revision: number; sealed: SealedRefView } | null;
