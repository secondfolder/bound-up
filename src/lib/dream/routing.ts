/**
 * Which adult level a request needs from a provider (docs/dreams.md,
 * "Adult-friendly providers"). Pure and alias-free.
 */

import { ADULT_LEVELS, type AdultLevel } from '../model-providers';

/**
 * Every request needs full adult support: the highest level checked,
 * whatever the daydream's heat. A story can go anywhere its user takes it,
 * and a provider that passed only the milder levels would refuse it part way,
 * so the engine never sends anything to one.
 */
export const REQUIRED_LEVEL = Math.max(...ADULT_LEVELS.map((entry) => entry.level)) as AdultLevel;
