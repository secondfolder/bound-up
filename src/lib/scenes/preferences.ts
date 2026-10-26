import { z } from 'zod';
import {
	DEFAULT_PROMPT_LEVEL,
	MAX_PROMPT_LEVEL,
	MIN_PROMPT_LEVEL,
	PROMPT_TYPES,
	type PromptType
} from './considerations';

/**
 * One person's own settings for the scene designer's prompt column: how much
 * of each type to show, and the prompts they never want to see again. They
 * follow the person between devices and scenes.
 *
 * Sealed in their own vault (`scene-preferences`), not a plain column:
 * which prompts someone waves away for good says something about what they
 * are into. Whether the column is collapsed is a per-device convenience and
 * is not here. See docs/scenes.md, "Where the prompts' state lives".
 */

/** More than the catalogue will ever hold; a guard, not a budget. */
export const MAX_NEVER_SHOW = 500;

const level = z.number().int().min(MIN_PROMPT_LEVEL).max(MAX_PROMPT_LEVEL);

export const scenePreferencesSchema = z.object({
	/** By prompt type; a type left out is at `DEFAULT_PROMPT_LEVEL`. */
	levels: z.partialRecord(z.enum(PROMPT_TYPES), level),
	/** Prompt ids, kept even after a prompt leaves the catalogue: they do no harm. */
	neverShow: z.array(z.string().min(1).max(80)).max(MAX_NEVER_SHOW)
});

export type ScenePreferences = z.output<typeof scenePreferencesSchema>;

export const DEFAULT_SCENE_PREFERENCES: ScenePreferences = { levels: {}, neverShow: [] };

export function levelFor(preferences: ScenePreferences, type: PromptType): number {
	return preferences.levels[type] ?? DEFAULT_PROMPT_LEVEL;
}

export function withLevel(
	preferences: ScenePreferences,
	type: PromptType,
	next: number
): ScenePreferences {
	return { ...preferences, levels: { ...preferences.levels, [type]: next } };
}

export function withNeverShow(preferences: ScenePreferences, promptId: string): ScenePreferences {
	if (preferences.neverShow.includes(promptId)) {
		return preferences;
	}
	return { ...preferences, neverShow: [...preferences.neverShow, promptId].slice(-MAX_NEVER_SHOW) };
}

export function withoutNeverShow(
	preferences: ScenePreferences,
	promptId: string
): ScenePreferences {
	return { ...preferences, neverShow: preferences.neverShow.filter((id) => id !== promptId) };
}

/**
 * Two devices saving at once: the later one fetches what won and merges into
 * it. Levels are taken from `mine` (the change just made); the never-show
 * lists are unioned, since waving a prompt away on one device should not be
 * undone by a save from another.
 */
export function mergePreferences(
	theirs: ScenePreferences,
	mine: ScenePreferences
): ScenePreferences {
	return {
		levels: { ...theirs.levels, ...mine.levels },
		neverShow: [...new Set([...theirs.neverShow, ...mine.neverShow])].slice(-MAX_NEVER_SHOW)
	};
}
