/**
 * Which adult level a request needs from a provider (docs/dreams.md,
 * "Adult-friendly providers"). Pure and alias-free.
 */

import type { AdultLevel } from '../model-providers';
import type { Heat } from './build';

const BY_HEAT: Readonly<Record<Heat, AdultLevel>> = {
	none: 0,
	suggestive: 1,
	steamy: 2,
	explicit: 3
};

/**
 * A passage's level, from its daydream's heat. Before the heat is known (the
 * reading and the build), a brief could ask for anything, so those ask for
 * the explicit level too: a provider that would refuse the story should not
 * be the one to set it up.
 */
export function levelFor(heat: Heat | null): AdultLevel {
	return heat === null ? BY_HEAT.explicit : BY_HEAT[heat];
}
