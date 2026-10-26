/**
 * Every sealed kind the app has, in one list.
 *
 * What the frozen-fixture test walks (`sealed-fixtures.test.ts`): every
 * version of every kind here must have a fixture that still opens, so adding
 * a kind or a version without one fails CI rather than going unnoticed.
 *
 * Imported only by code Vite bundles (the app and the server), never by the
 * Drizzle schema, so these need not be alias-free.
 */

import type { SealedKind } from '../sealed';
import {
	daydreamCharacterKind,
	daydreamExchangeKind,
	daydreamIdeaKind,
	daydreamMarkKind,
	daydreamSetupExchangeKind,
	daydreamSetupKind,
	daydreamTurnKind
} from './daydreams';
import { kinkListKind, kinkListPartnerKind } from './kink-list';
import { messageBodyKind, messageMetadataKind, messageReactionKind } from './messages';
import {
	notebookAwarenessKind,
	notebookEntryKind,
	notebookSnapshotKind,
	notebookUpdateKind
} from './notebook';
import { partnershipInviteKind, partnershipNamesKind } from './partnerships';
import { scenePreferencesKind } from './scenes';
import { tagKind } from './tags';
import { rewardKind, taskKind } from './tasks';

export const ALL_SEALED_KINDS: readonly SealedKind<unknown>[] = [
	messageBodyKind,
	messageMetadataKind,
	messageReactionKind,
	taskKind,
	rewardKind,
	tagKind,
	partnershipNamesKind,
	partnershipInviteKind,
	daydreamSetupKind,
	daydreamTurnKind,
	daydreamMarkKind,
	daydreamCharacterKind,
	daydreamIdeaKind,
	daydreamExchangeKind,
	daydreamSetupExchangeKind,
	kinkListKind,
	kinkListPartnerKind,
	notebookEntryKind,
	notebookUpdateKind,
	notebookAwarenessKind,
	notebookSnapshotKind,
	scenePreferencesKind
];
