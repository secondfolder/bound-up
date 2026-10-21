import { SHARED_CHARACTERS } from './characters';
import { CNC } from './cnc';
import { COMEDY } from './comedy';
import { CONTROL } from './control';
import { FAMILY } from './family';
import { GROUP } from './group';
import { MACHINES } from './machines';
import { POWER } from './power';
import { ROMANCE } from './romance';
import { SUPERNATURAL } from './supernatural';
import type { PresetModule } from './types';

/**
 * The catalog's starting points, one module per theme (docs/daydreams.md,
 * "What the presets are drawn from"): each its own characters, ideas and
 * ready-made daydreams, so a theme can be reworked without touching the
 * rest. `catalog.ts` and `starters.ts` gather them and put them in order of
 * heat, so the order within a module is only the order within a heat.
 *
 * Pure and alias-free.
 */
const MODULES: readonly PresetModule[] = [
	ROMANCE,
	POWER,
	SUPERNATURAL,
	CONTROL,
	GROUP,
	CNC,
	FAMILY,
	COMEDY,
	MACHINES
];

export const PRESET_CHARACTERS = [
	...SHARED_CHARACTERS,
	...MODULES.flatMap((module) => module.characters)
];

export const PRESET_IDEAS = MODULES.flatMap((module) => module.ideas);

export const PRESET_STARTERS = MODULES.flatMap((module) => module.starters);
