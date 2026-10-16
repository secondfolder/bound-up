/**
 * Every sealed kind the app has, in one list.
 *
 * What the frozen-fixture test walks (`sealed-fixtures.test.ts`): every
 * version of every kind here must have a fixture that still opens, so adding
 * a kind or a version without one fails CI rather than going unnoticed.
 *
 * Alias-free, like the kinds themselves.
 */

import type { SealedKind } from '../sealed';
import { messageBodyKind, messageMetadataKind, messageReactionKind } from './messages';

export const ALL_SEALED_KINDS: readonly SealedKind<unknown>[] = [
	messageBodyKind,
	messageMetadataKind,
	messageReactionKind
];
