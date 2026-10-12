import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	effectiveIqs,
	effectiveVibe,
	flashes,
	humiliates,
	INTENSITIES,
	type Intensity,
	looksThemed,
	playsBackdrop,
	playsHypno,
	type Settings,
	settingsSchema,
	showsPorn,
	themesQuestions,
	toggleLevel,
	togglesAt,
	VIBES
} from './settings';

const at = (intensity: Intensity, extra: Partial<Settings> = {}): Settings => ({
	...DEFAULT_SETTINGS,
	intensity,
	vibe: intensity >= 2 ? 'denial' : null,
	...extra
});

describe('levels and toggles', () => {
	it('offers each toggle from the level that turns its effect on, for every vibe', () => {
		const effects = {
			humiliating: humiliates,
			themedLook: looksThemed,
			themedQuestions: themesQuestions,
			hypno: playsHypno,
			porn: showsPorn,
			subliminals: flashes
		} as const;
		for (const vibe of VIBES) {
			for (const intensity of INTENSITIES) {
				const offered = togglesAt(intensity, vibe);
				for (const [toggle, effect] of Object.entries(effects)) {
					const from = toggleLevel(toggle as keyof typeof effects, vibe);
					expect(
						offered.includes(toggle as keyof typeof effects),
						`${toggle} at ${intensity}`
					).toBe(intensity >= from);
					expect(effect({ intensity, vibe }), `${toggle} at ${intensity} for ${vibe}`).toBe(
						intensity >= from
					);
				}
			}
		}
	});

	it('offers more toggles at each level, in the order they are shown', () => {
		expect(togglesAt(0, 'denial')).toEqual([]);
		expect(togglesAt(1, 'denial')).toEqual(['humiliating']);
		expect(togglesAt(2, 'denial')).toEqual(['humiliating', 'themedLook', 'themedQuestions']);
		expect(togglesAt(3, 'denial')).toEqual([
			'humiliating',
			'themedLook',
			'themedQuestions',
			'hypno',
			'porn'
		]);
		expect(togglesAt(4, 'denial').at(-1)).toBe('subliminals');
		// Bambi's hypno is audio, so it comes in with the vibe.
		expect(togglesAt(2, 'bambi')).toContain('hypno');
	});

	it('does everything a level offers while its toggles are on', () => {
		const levels = INTENSITIES.map((intensity) => {
			const settings = at(intensity);
			return [
				humiliates(settings),
				looksThemed(settings),
				themesQuestions(settings),
				showsPorn(settings),
				playsHypno(settings),
				flashes(settings),
				playsBackdrop(settings)
			];
		});
		expect(levels).toEqual([
			[false, false, false, false, false, false, false],
			[true, false, false, false, false, false, false],
			[true, true, true, false, false, false, false],
			[true, true, true, true, true, false, false],
			[true, true, true, true, true, true, true]
		]);
	});

	it('turns each thing off with its own toggle, and nothing else', () => {
		const overload = at(4);
		expect(humiliates({ ...overload, humiliating: false })).toBe(false);
		expect(looksThemed({ ...overload, themedLook: false })).toBe(false);
		expect(themesQuestions({ ...overload, themedLook: false })).toBe(true);
		expect(themesQuestions({ ...overload, themedQuestions: false })).toBe(false);
		expect(playsHypno({ ...overload, hypno: false })).toBe(false);
		expect(flashes({ ...overload, subliminals: false })).toBe(false);
		// The background is porn, not a subliminal: it stays without them, and
		// goes with the porn.
		expect(playsBackdrop({ ...overload, subliminals: false })).toBe(true);
		expect(playsBackdrop({ ...overload, porn: false })).toBe(false);
		expect(showsPorn({ ...overload, porn: false })).toBe(false);
	});

	it('plays bambi’s hypno from level 2, every other vibe’s from 3', () => {
		expect(playsHypno(at(2, { vibe: 'bambi' }))).toBe(true);
		expect(playsHypno(at(2))).toBe(false);
		expect(playsHypno(at(3))).toBe(true);
		expect(playsHypno(at(1, { vibe: 'bambi' }))).toBe(false);
	});

	it('has no vibe below level 2, even one remembered from before', () => {
		expect(effectiveVibe({ intensity: 1, vibe: 'bambi' })).toBeNull();
		expect(looksThemed({ intensity: 1, vibe: 'bambi' })).toBe(false);
		expect(effectiveVibe({ intensity: 2, vibe: 'bambi' })).toBe('bambi');
	});

	it('reads settings remembered before the toggles existed as all on', () => {
		const parsed = settingsSchema.parse({
			role: 'sub',
			intensity: 4,
			vibe: 'gooner',
			soberIq: null,
			targetIq: null
		});
		expect(parsed).toEqual({ ...DEFAULT_SETTINGS, intensity: 4, vibe: 'gooner' });
	});

	it('needs a vibe from level 2, and not below it', () => {
		expect(settingsSchema.safeParse(at(1)).success).toBe(true);
		expect(settingsSchema.safeParse(at(2, { vibe: null })).success).toBe(false);
	});
});

describe('effectiveIqs', () => {
	it('compares against the IQs from level 1, and keeps them unused below it', () => {
		const typed = { soberIq: 110, targetIq: 70 };
		expect(effectiveIqs({ intensity: 1, ...typed })).toEqual(typed);
		expect(effectiveIqs({ intensity: 0, ...typed })).toEqual({ soberIq: null, targetIq: null });
	});
});
