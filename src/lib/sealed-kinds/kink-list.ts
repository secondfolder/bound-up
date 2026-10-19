/**
 * The sealed kind behind a person's own kink list: every answer, note, custom
 * kink and quick-fill choice, as one record in their own vault. One record
 * rather than a row per kink, so the server cannot tell which kinks someone
 * answered, or how many of a category. See docs/kink-list.md, "Privacy".
 */

import { listPayloadSchema } from '../kink-list/answers';
import { defineSealedKind } from '../sealed';

export const kinkListKind = defineSealedKind({
	name: 'kink-list',
	// A full list with a note on every kink is far larger than anyone writes,
	// and still well under D1's row limit; this is a guard, not a budget.
	maxCiphertextLength: 1024 * 1024,
	versions: [{ version: 1, schema: listPayloadSchema }]
});
