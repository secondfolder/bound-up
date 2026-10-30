import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { FORMAT_FILES, PLAYGROUND_FILE, type PlaygroundEntry } from '$lib/image-playground';

/**
 * The picture playground's history (docs/debug-mode.md, "Picture
 * playground"): each run's settings and pictures, in the OS's temp
 * directory, so a comparison survives a reload without going anywhere a
 * user's things are kept. The OS clears it in its own time.
 *
 * Node only: imported behind `dev || __SELF_HOSTED__`, so `node:fs` never
 * reaches the worker bundle. A Workers server keeps no history; its page
 * shows only what was drawn while it was open.
 */

/** `PLAYGROUND_DIR` moves it, which only the e2e suite does, into its run directory. */
export function historyDir(): string {
	return process.env.PLAYGROUND_DIR || join(tmpdir(), 'bound-up-image-playground');
}

/** How many runs the page lists, newest first. */
const HISTORY_LIMIT = 200;

/** Writes one run and its pictures, and returns it with each picture's `src` pointing at its file. */
export async function saveEntry(
	entry: Omit<PlaygroundEntry, 'images'>,
	pictures: {
		bytes: Uint8Array;
		extension: string;
		seed: number | null;
		cost: number | null;
		nsfw: boolean | null;
	}[]
): Promise<PlaygroundEntry> {
	const dir = historyDir();
	await mkdir(dir, { recursive: true });
	const images = await Promise.all(
		pictures.map(async (picture, index) => {
			const file = `${entry.id}-${index}.${picture.extension}`;
			await writeFile(join(dir, file), picture.bytes);
			return { src: pictureUrl(file), seed: picture.seed, cost: picture.cost, nsfw: picture.nsfw };
		})
	);
	const saved: PlaygroundEntry = { ...entry, images };
	await writeFile(join(dir, `${entry.id}.json`), JSON.stringify(saved));
	return saved;
}

export function pictureUrl(file: string): string {
	return `/api/debug/images/${file}`;
}

/** Every run kept, newest first. A file that cannot be read is skipped: it is a cache. */
export async function listEntries(): Promise<PlaygroundEntry[]> {
	const dir = historyDir();
	const files = await readdir(dir).catch(() => [] as string[]);
	const entries = await Promise.all(
		files
			.filter((file) => file.endsWith('.json') && PLAYGROUND_FILE.test(file))
			.map(async (file) => {
				try {
					return JSON.parse(await readFile(join(dir, file), 'utf8')) as PlaygroundEntry;
				} catch {
					return null;
				}
			})
	);
	return entries
		.filter((entry): entry is PlaygroundEntry => entry !== null)
		.sort((a, b) => b.at.localeCompare(a.at))
		.slice(0, HISTORY_LIMIT);
}

/** One kept file, or null. The name is checked first, so nothing outside the directory can be named. */
export async function readPicture(file: string): Promise<Uint8Array | null> {
	if (!(PLAYGROUND_FILE.test(file) && !file.endsWith('.json'))) {
		return null;
	}
	return await readFile(join(historyDir(), file)).catch(() => null);
}

/** Forgets every run of one comparison, pictures and all. */
export async function deleteRun(runId: string): Promise<void> {
	const dir = historyDir();
	const entries = (await listEntries()).filter((entry) => entry.runId === runId);
	await Promise.all(
		entries.flatMap((entry) => [
			rm(join(dir, `${entry.id}.json`), { force: true }),
			...entry.images.map((_, index) =>
				rm(join(dir, `${entry.id}-${index}.${FORMAT_FILES[entry.task.outputFormat].extension}`), {
					force: true
				})
			)
		])
	);
}
