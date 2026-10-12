import { multiChoices } from './choices';
import type { Generator } from './types';

/**
 * Pictures shown one at a time, then eight: tick the ones that were shown.
 * After openpsychometrics' Full Scale IQ Test exposure memory section, whose
 * sequences get longer and faster (1.5 seconds a picture down to 0.6).
 * Partly credited, so a guess costs what a memory gains.
 *
 * Emoji rather than drawn icons: every device has them, nothing has to be
 * fetched, and each comes with a name for a screen reader.
 */
const ICONS: readonly (readonly [icon: string, name: string])[] = [
	['🍎', 'apple'],
	['🚲', 'bicycle'],
	['🎈', 'balloon'],
	['🔑', 'key'],
	['🌵', 'cactus'],
	['🐢', 'turtle'],
	['⚓', 'anchor'],
	['🎸', 'guitar'],
	['🍄', 'mushroom'],
	['🧲', 'magnet'],
	['🦋', 'butterfly'],
	['🌙', 'moon'],
	['⏰', 'alarm clock'],
	['🎩', 'top hat'],
	['🍋', 'lemon'],
	['🐙', 'octopus'],
	['🚀', 'rocket'],
	['🔔', 'bell'],
	['🌻', 'sunflower'],
	['🧩', 'puzzle piece'],
	['🦊', 'fox'],
	['🍩', 'doughnut'],
	['📎', 'paperclip'],
	['🐝', 'bee'],
	['🎲', 'die'],
	['🌂', 'umbrella'],
	['🍉', 'watermelon'],
	['🦉', 'owl']
];

/** Shown, then the speed each is shown at, by difficulty. */
const PACES = [
	{ shown: 4, ms: 1500 },
	{ shown: 5, ms: 1200 },
	{ shown: 6, ms: 1000 },
	{ shown: 7, ms: 800 },
	{ shown: 8, ms: 600 }
] as const;

/** Of the eight to choose from, how many were shown: 3 to 5, as theirs. */
const OPTIONS = 8;

export const exposureMemory: Generator = (rng, difficulty, _context, id) => {
	const pace = PACES[difficulty - 1] ?? PACES[0];
	const [shown, unseen] = ((pool) => [pool.slice(0, pace.shown), pool.slice(pace.shown)])(
		rng.sample(ICONS, pace.shown + OPTIONS)
	);
	const asked = rng.int(3, Math.min(5, shown.length));
	const toChoice = ([icon, name]: readonly [string, string]) => ({ label: name, icon });
	return {
		id,
		kind: 'exposure-memory',
		difficulty,
		prompt: 'Tick every picture that was shown. Leave any you are not sure of.',
		display: { type: 'none' },
		memorise: {
			prompt: 'Remember these pictures. They come one at a time.',
			items: shown.map(([icon]) => icon),
			intervalMs: pace.ms,
			seconds: Math.ceil((shown.length * pace.ms) / 1000)
		},
		format: 'multi',
		...multiChoices(
			rng,
			rng.sample(shown, asked).map(toChoice),
			unseen.slice(0, OPTIONS - asked).map(toChoice)
		)
	};
};
