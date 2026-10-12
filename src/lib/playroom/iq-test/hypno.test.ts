import { describe, expect, it } from 'vitest';
import {
	categoryCounts,
	categoryTier,
	defaultCategories,
	filesPageUrl,
	filterHypnos,
	formatDuration,
	type HypnoFile,
	hypnoSourceFor,
	parseFilesPage,
	pickRandom,
	triggerCounts
} from './hypno';
import { createRng } from './random';

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function raw(n: number, overrides: Record<string, unknown> = {}) {
	return {
		id: n,
		uuid: UUID(n),
		name: `File ${n}`,
		duration: 300_000,
		fileType: 'loop',
		description: 'A loop.',
		audioURL: `https://cdn.bambicloud.com/${UUID(n)}.mp3`,
		plays: n,
		author: { username: 'bimbodollbambi' },
		triggers: [{ name: 'Good girl' }],
		warnings: [],
		...overrides
	};
}

function file(n: number, overrides: Partial<HypnoFile> = {}): HypnoFile {
	return {
		source: 'bambicloud',
		pageUrl: `https://bambicloud.com/file/${UUID(n)}`,
		uuid: UUID(n),
		name: `File ${n}`,
		author: 'someone',
		durationMs: 300_000,
		fileType: 'loop',
		triggers: [],
		description: '',
		warnings: [],
		mediaUrl: `https://cdn.bambicloud.com/${UUID(n)}.mp3`,
		plays: 0,
		...overrides
	};
}

describe('parseFilesPage', () => {
	it('keeps playable files, trimmed to what the page needs', () => {
		const { files, total } = parseFilesPage({
			files: [raw(1, { warnings: [{ name: 'x', text: 'Obedience suggestions' }] })],
			totalItems: 748
		});
		expect(total).toBe(748);
		expect(files).toEqual([
			{
				source: 'bambicloud',
				pageUrl: `https://bambicloud.com/file/${UUID(1)}`,
				uuid: UUID(1),
				name: 'File 1',
				author: 'bimbodollbambi',
				durationMs: 300_000,
				fileType: 'loop',
				triggers: ['Good girl'],
				description: 'A loop.',
				warnings: ['Obedience suggestions'],
				mediaUrl: `https://cdn.bambicloud.com/${UUID(1)}.mp3`,
				plays: 1
			}
		]);
	});

	it('drops locked, off-CDN and malformed entries', () => {
		const { files } = parseFilesPage({
			files: [
				raw(1, { audioURL: null }), // Patreon-locked: no file without the creator's token
				raw(2, { audioURL: 'https://evil.example/x.mp3' }),
				raw(3, { audioURL: 'https://cdn.bambicloud.com/x.exe' }),
				raw(4, { uuid: '../../etc' }),
				raw(5, { name: 42 }),
				null,
				'nonsense',
				raw(6)
			],
			totalItems: 6
		});
		expect(files.map((entry) => entry.uuid)).toEqual([UUID(6)]);
	});

	it('answers an empty page for an answer that is not one', () => {
		expect(parseFilesPage(null)).toEqual({ files: [], total: 0 });
		expect(parseFilesPage({ error: 'nope' })).toEqual({ files: [], total: 0 });
	});

	it('asks for unlocked files, most played first, a page at a time', () => {
		const url = new URL(filesPageUrl(100));
		expect(url.origin).toBe('https://api.bambicloud.com');
		expect(Object.fromEntries(url.searchParams)).toEqual({
			showLocked: 'false',
			pageSize: '50',
			pageOffset: '100',
			sortType: 'playcount',
			sortDirection: 'descending'
		});
	});
});

describe('filterHypnos', () => {
	const files = [
		file(1, {
			name: 'Bimbo Drone',
			fileType: 'loop',
			triggers: ['Good girl'],
			durationMs: 5 * 60_000
		}),
		file(2, { name: 'Pink Song', fileType: 'music', author: 'bambi', durationMs: 3 * 60_000 }),
		file(3, {
			name: 'Long Session',
			fileType: 'full session',
			description: 'Drift deep into pink',
			durationMs: 60 * 60_000
		})
	];

	it('matches every word of a query against name, author, triggers and description', () => {
		expect(filterHypnos(files, { query: 'drone' }).map((f) => f.name)).toEqual(['Bimbo Drone']);
		expect(filterHypnos(files, { query: 'GOOD girl' }).map((f) => f.name)).toEqual(['Bimbo Drone']);
		expect(filterHypnos(files, { query: 'pink' }).map((f) => f.name)).toEqual([
			'Pink Song',
			'Long Session'
		]);
		expect(filterHypnos(files, { query: 'pink drone' })).toEqual([]);
	});

	it('filters by any of the categories, and by none meaning all', () => {
		expect(filterHypnos(files, { categories: ['loop', 'music'] })).toHaveLength(2);
		expect(filterHypnos(files, { categories: [] })).toHaveLength(3);
	});

	it('filters by trigger and by length', () => {
		expect(filterHypnos(files, { trigger: 'good girl' }).map((f) => f.name)).toEqual([
			'Bimbo Drone'
		]);
		expect(filterHypnos(files, { maxMinutes: 10 })).toHaveLength(2);
	});
});

describe('pickRandom', () => {
	const files = [file(1), file(2), file(3)];

	it('is deterministic for a seed', () => {
		expect(pickRandom(files, createRng(4))).toEqual(pickRandom(files, createRng(4)));
	});

	it('avoids the excluded file when there is anything else', () => {
		for (let seed = 0; seed < 30; seed += 1) {
			expect(pickRandom(files, createRng(seed), UUID(2))?.uuid).not.toBe(UUID(2));
		}
		expect(pickRandom([file(2)], createRng(1), UUID(2))?.uuid).toBe(UUID(2));
	});

	it('picks nothing from nothing', () => {
		expect(pickRandom([], createRng(1))).toBeNull();
	});
});

describe('categories', () => {
	it('defaults to music without porn, and loops and subliminals with it', () => {
		const mood = { intensity: 2, vibe: 'bambi' } as const;
		const porn = { intensity: 3, vibe: 'bambi' } as const;
		expect(defaultCategories(mood)).toEqual(['music', 'ai music']);
		expect(defaultCategories(porn)).toEqual(['loop', 'subliminal']);
		expect(categoryTier(mood)).toBe('mood');
		expect(categoryTier({ ...porn, intensity: 4 })).toBe('porn');
		// Porn turned off: back to music.
		expect(categoryTier({ ...porn, porn: false })).toBe('mood');
	});

	it('plays bambi from bambicloud unless switched, and every other vibe from PMVHaven', () => {
		expect(hypnoSourceFor('bambi', null)).toBe('bambicloud');
		expect(hypnoSourceFor('bambi', 'pmvhaven')).toBe('pmvhaven');
		expect(hypnoSourceFor('denial', null)).toBe('pmvhaven');
		expect(hypnoSourceFor('denial', 'bambicloud')).toBe('pmvhaven');
	});

	it('counts files per category and per trigger', () => {
		const files = [
			file(1, { fileType: 'loop', triggers: ['A', 'B'] }),
			file(2, { fileType: 'loop', triggers: ['A'] }),
			file(3, { fileType: 'music', triggers: [] })
		];
		expect(categoryCounts(files).find((c) => c.id === 'loop')?.count).toBe(2);
		expect(triggerCounts(files)).toEqual([
			{ name: 'A', count: 2 },
			{ name: 'B', count: 1 }
		]);
	});
});

describe('formatDuration', () => {
	it('reads as m:ss, or h:mm:ss past an hour', () => {
		expect(formatDuration(65_000)).toBe('1:05');
		expect(formatDuration(3_723_000)).toBe('1:02:03');
		expect(formatDuration(-5)).toBe('0:00');
	});
});
