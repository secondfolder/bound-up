/**
 * The sealed kinds behind the scene designer. A scene itself is a notebook
 * entry and is sealed as one (`./notebook`); what is here is the person's own
 * settings for the prompt column. See docs/scenes.md.
 */

import { scenePreferencesSchema } from '../scenes/preferences';
import { defineSealedKind } from '../sealed';

/**
 * One person's prompt-column settings, in their own vault: how much of each
 * type of prompt to show, and which prompts they never want to see. Sealed,
 * because the prompts someone waves away say something about what they are
 * into.
 */
export const scenePreferencesKind = defineSealedKind({
	name: 'scene-preferences',
	maxCiphertextLength: 64 * 1024,
	versions: [{ version: 1, schema: scenePreferencesSchema }]
});
