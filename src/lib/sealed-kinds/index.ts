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
import { messageBodyKind, messageMetadataKind, messageReactionKind } from './messages';
import { rewardKind, taskKind } from './tasks';

export const ALL_SEALED_KINDS: readonly SealedKind<unknown>[] = [
	messageBodyKind,
	messageMetadataKind,
	messageReactionKind,
	taskKind,
	rewardKind
];
