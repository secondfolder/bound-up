import { describe, expect, it } from 'vitest';
import {
	DOCK_GAP,
	dockLayouts,
	layoutFor,
	MINIMAL_LAYOUT,
	roomPerTab,
	SETTINGS_TAB_LABELLED_WIDTH,
	SETTINGS_TAB_SLIDER_LABELLED_WIDTH,
	SETTINGS_TAB_SLIDER_WIDTH,
	SETTINGS_TAB_WIDTH,
	showsEverything,
	TAB_LAYOUTS
} from './dock';

describe('layoutFor', () => {
	it('steps down as the room shrinks: title, action label, slider, detail, then all', () => {
		expect(layoutFor(1200)).toEqual({
			title: 'full',
			detail: 'full',
			slider: true,
			action: 'label'
		});
		expect(layoutFor(520).title).toBe('short');
		expect(layoutFor(420).action).toBe('icon');
		expect(layoutFor(300)).toMatchObject({ slider: false, detail: 'short' });
		expect(layoutFor(210).title).toBeNull();
		expect(layoutFor(100)).toEqual(MINIMAL_LAYOUT);
	});

	it('is at its smallest before the dock has been measured', () => {
		expect(layoutFor(roomPerTab(0, 2, 0))).toEqual(MINIMAL_LAYOUT);
	});

	it('only ever takes things away as it narrows', () => {
		const rank = { full: 2, short: 1, label: 2, icon: 1 } as const;
		const score = (value: keyof typeof rank | null) => (value === null ? 0 : rank[value]);
		for (let i = 1; i < TAB_LAYOUTS.length; i += 1) {
			const [, wider] = TAB_LAYOUTS[i - 1] ?? [0, MINIMAL_LAYOUT];
			const [, narrower] = TAB_LAYOUTS[i] ?? [0, MINIMAL_LAYOUT];
			expect(score(narrower.title)).toBeLessThanOrEqual(score(wider.title));
			expect(score(narrower.detail)).toBeLessThanOrEqual(score(wider.detail));
			expect(score(narrower.action)).toBeLessThanOrEqual(score(wider.action));
			expect(Number(narrower.slider)).toBeLessThanOrEqual(Number(wider.slider));
		}
	});
});

describe('roomPerTab', () => {
	it('shares the dock between the tabs, gap included', () => {
		expect(roomPerTab(1000 + DOCK_GAP, 2, 0)).toBe(500);
		expect(roomPerTab(1000, 1, 0)).toBe(1000);
	});

	it('takes the settings tab off first', () => {
		expect(roomPerTab(1000 + SETTINGS_TAB_WIDTH + DOCK_GAP, 1, SETTINGS_TAB_WIDTH)).toBe(1000);
	});
});

describe('dockLayouts', () => {
	/** Room for two media tabs at their widest beside a settings tab this wide. */
	const besideWidest = (settingsWidth: number) => 2 * 660 + DOCK_GAP * 2 + settingsWidth;

	it('labels the fullscreen button when the media tabs label their actions, and not otherwise', () => {
		for (const width of [320, 600, 900, 1200, 1600, 2400]) {
			for (const withSlider of [true, false]) {
				const { media, settings } = dockLayouts(width, 2, true, withSlider);
				expect(settings.action, `${width}px`).toBe(media.action === 'label' ? 'label' : 'icon');
			}
		}
		expect(dockLayouts(2400, 2, true).settings.action).toBe('label');
		expect(dockLayouts(390, 2, true).settings.action).toBe('icon');
	});

	it('sheds the fullscreen label first, then the intensity slider, as the dock narrows', () => {
		const labelled = besideWidest(SETTINGS_TAB_SLIDER_LABELLED_WIDTH);
		expect(dockLayouts(labelled, 2, true).settings).toMatchObject({
			slider: true,
			action: 'label'
		});
		expect(dockLayouts(labelled, 2, true).media).toEqual(layoutFor(660));

		// Short of that: the label goes, the media tabs' with it, and the slider stays.
		expect(dockLayouts(labelled - 20, 2, true).settings).toMatchObject({
			slider: true,
			action: 'icon'
		});
		const icons = besideWidest(SETTINGS_TAB_SLIDER_WIDTH);
		expect(dockLayouts(icons, 2, true).settings).toMatchObject({ slider: true, action: 'icon' });
		expect(dockLayouts(icons, 2, true).media).toEqual({ ...layoutFor(660), action: 'icon' });

		// Short of that: the slider goes too, and the media tabs keep their room.
		expect(dockLayouts(icons - 20, 2, true).settings).toMatchObject({
			slider: false,
			action: 'icon'
		});
		expect(dockLayouts(1200, 2, true).settings.slider).toBe(false);
	});

	it('only ever takes from the settings tab as the dock narrows', () => {
		const score = ({ slider, action }: { slider: boolean; action: string | null }) =>
			(slider ? 2 : 0) + (action === 'label' ? 1 : 0);
		for (const mediaTabs of [0, 1, 2]) {
			let wider = Number.POSITIVE_INFINITY;
			for (let width = 2400; width >= 0; width -= 4) {
				const now = score(dockLayouts(width, mediaTabs, true).settings);
				expect(now, `${width}px, ${mediaTabs} media tabs`).toBeLessThanOrEqual(wider);
				wider = now;
			}
		}
	});

	it('steps down on its own the same way, as in the results in fullscreen', () => {
		expect(dockLayouts(SETTINGS_TAB_SLIDER_LABELLED_WIDTH, 0, true).settings).toMatchObject({
			slider: true,
			action: 'label'
		});
		expect(dockLayouts(SETTINGS_TAB_SLIDER_WIDTH, 0, true).settings).toMatchObject({
			slider: true,
			action: 'icon'
		});
		expect(dockLayouts(SETTINGS_TAB_SLIDER_WIDTH - 1, 0, true).settings).toMatchObject({
			slider: false,
			action: 'icon'
		});
	});

	it('without a slider to show, labels the button whenever the label fits', () => {
		expect(dockLayouts(400, 0, true, false).settings).toMatchObject({
			slider: false,
			action: 'label'
		});
		expect(dockLayouts(200, 0, true, false).settings.action).toBe('icon');
		const width = 2 * 660 + DOCK_GAP * 2 + SETTINGS_TAB_LABELLED_WIDTH;
		expect(dockLayouts(width, 2, true, false).media).toEqual(layoutFor(660));
	});
});

describe('showsEverything', () => {
	it('is true once the labelled action and, with sound, the slider both fit', () => {
		const widest = layoutFor(2000);
		expect(showsEverything(widest, true)).toBe(true);
		expect(showsEverything({ ...widest, slider: false }, true)).toBe(false);
		expect(showsEverything({ ...widest, slider: false }, false)).toBe(true);
		expect(showsEverything({ ...widest, action: 'icon' }, false)).toBe(false);
	});
});
