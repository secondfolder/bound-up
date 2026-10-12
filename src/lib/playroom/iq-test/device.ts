import { iqTestResultSchema } from '$lib/schemas/iqTestResult';
import type { IqTestResultView } from '$lib/types';
import {
	categoryTier,
	defaultCategories,
	type HypnoCategory,
	type HypnoSource,
	isHypnoCategory,
	isHypnoSource
} from './hypno';
import type { Run } from './run';
import { DEFAULT_SETTINGS, type Settings, type SettingsLike, settingsSchema } from './settings';

/**
 * What the IQ test keeps in the browser: the last settings, a run in progress,
 * and a signed-out visitor's history.
 *
 * Every access is wrapped, because storage throws in a private window, comes
 * back empty after site data is cleared, and is shared with whatever an older
 * build wrote. Anything that does not parse is treated as absent, never
 * trusted.
 */

/**
 * One key's value, as JSON, or null for anything absent, unreadable or not
 * JSON. Every access goes through these two, for the reasons above.
 */
function read(storage: () => Storage, key: string): unknown {
	try {
		const raw = storage().getItem(key);
		return raw === null ? null : JSON.parse(raw);
	} catch {
		return null;
	}
}

function write(storage: () => Storage, key: string, value: unknown): void {
	try {
		if (value === null) {
			storage().removeItem(key);
		} else {
			storage().setItem(key, JSON.stringify(value));
		}
	} catch {
		// Full, blocked or absent: a convenience is lost, nothing more.
	}
}

const local = () => localStorage;
const session = () => sessionStorage;

const SETTINGS_KEY = 'playroom.iq-test.settings';
const RUN_KEY = 'playroom.iq-test.run';
const HISTORY_KEY = 'playroom.iq-test.history';

/**
 * Set once the setup dialog has been dealt with — started from or closed — so
 * a reload in the same browser session does not ask again.
 *
 * A cookie, not storage, because the server needs it: the dialog is rendered
 * open on the server so it covers the page from the first paint, and only a
 * cookie reaches the server in time to render it closed instead. A session
 * cookie (no expiry), so a new visit after the browser has been closed still
 * starts with the disclaimer. Scoped to the test's own path; it carries
 * nothing but "seen".
 */
export const DIALOG_SEEN_COOKIE = 'iq-test-dialog-seen';
export const DIALOG_SEEN_PATH = '/playroom/iq-test';

export function markDialogSeen(): void {
	try {
		// biome-ignore lint/suspicious/noDocumentCookie: a session cookie the server reads to decide the first paint; the Cookie Store API is not in Firefox or Safari.
		document.cookie = `${DIALOG_SEEN_COOKIE}=1; Path=${DIALOG_SEEN_PATH}; SameSite=Lax`;
	} catch {
		// Cookies blocked: the dialog simply shows again on the next load.
	}
}

const ROLE_CHOSEN_KEY = 'playroom.iq-test.role-chosen';

/**
 * Whether a role has ever been chosen on this device. Until one has, the
 * setup dialog cannot be closed any other way: the test has no idea which
 * way to rig itself. Storage rather than the session cookie, because the
 * answer outlives the visit.
 */
export function roleChosen(): boolean {
	return read(local, ROLE_CHOSEN_KEY) === true;
}

/** Blocked storage loses it: the dialog simply asks for a role again next time. */
export function markRoleChosen(): void {
	write(local, ROLE_CHOSEN_KEY, true);
}

const HYPNO_CATEGORIES_KEY = 'playroom.iq-test.hypno-categories';

/**
 * The hypno categories a random pick draws from, as last chosen on this
 * device, per tier. Kept apart because the defaults are apart: music without
 * porn, loops and subliminals with it (`categoryTier`). Falls back to
 * that default for a tier never chosen, or for anything that does not parse.
 */
export function rememberedHypnoCategories(settings: SettingsLike): HypnoCategory[] {
	const stored = read(local, HYPNO_CATEGORIES_KEY);
	const tier = categoryTier(settings);
	const value = (stored as Record<string, unknown> | null)?.[tier];
	if (Array.isArray(value)) {
		const categories = value.filter(
			(category): category is HypnoCategory =>
				typeof category === 'string' && isHypnoCategory(category)
		);
		if (categories.length > 0) {
			return categories;
		}
	}
	return defaultCategories(settings);
}

export function rememberHypnoCategories(
	settings: SettingsLike,
	categories: readonly HypnoCategory[]
): void {
	const stored = read(local, HYPNO_CATEGORIES_KEY);
	const all = typeof stored === 'object' && stored !== null ? { ...stored } : {};
	write(local, HYPNO_CATEGORIES_KEY, { ...all, [categoryTier(settings)]: [...categories] });
}

const HYPNO_SOURCE_KEY = 'playroom.iq-test.hypno-source';

/**
 * Where the bambi vibe's hypno comes from, as last switched to in the hypno
 * panel: bambicloud or PMVHaven. Null when never switched, which means
 * bambicloud (see `hypnoSourceFor`).
 */
export function rememberedHypnoSource(): HypnoSource | null {
	const stored = read(local, HYPNO_SOURCE_KEY);
	return isHypnoSource(stored) ? stored : null;
}

export function rememberHypnoSource(source: HypnoSource): void {
	write(local, HYPNO_SOURCE_KEY, source);
}

/** Results kept on a device for a signed-out visitor. */
export const DEVICE_HISTORY_LIMIT = 20;

/** The settings last started with, so closing the dialog with the X reuses them. */
export function rememberedSettings(): Settings {
	const parsed = settingsSchema.safeParse(read(local, SETTINGS_KEY));
	return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function rememberSettings(settings: Settings): void {
	write(local, SETTINGS_KEY, settings);
}

/**
 * The run in progress, kept per tab so a reload does not throw away answers
 * already typed. Only its shape is checked: a run that does not look like one
 * is dropped and a fresh one is dealt.
 */
export function savedRun(): Run | null {
	const value = read(session, RUN_KEY);
	if (!isRunShaped(value)) {
		return null;
	}
	// The parsed settings, not the stored ones: parsing fills in defaults for
	// anything added since the run was saved, and drops anything since removed.
	// Returning the stored object once left a run from an older build with a
	// field undefined, which read as "off", and the hypno silently never
	// appeared after a reload.
	const parsed = settingsSchema.safeParse(value.settings);
	return parsed.success ? { ...value, settings: parsed.data } : null;
}

export function saveRun(run: Run | null): void {
	write(session, RUN_KEY, run);
}

function isRunShaped(value: unknown): value is Run {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const run = value as Partial<Run>;
	return (
		typeof run.seed === 'number' &&
		typeof run.index === 'number' &&
		Array.isArray(run.questions) &&
		Array.isArray(run.responses) &&
		Array.isArray(run.statuses) &&
		Array.isArray(run.variants) &&
		run.questions.length === run.responses.length &&
		run.questions.length === run.statuses.length &&
		run.questions.length === run.variants.length
	);
}

/**
 * An id for a result kept on this device.
 *
 * Not `crypto.randomUUID()`: browsers only provide it on a secure origin, and
 * the test is reached over plain HTTP too — a phone on the LAN hitting a dev
 * server, or a self-hosted box without TLS. There it threw, and since it ran
 * first thing in `finish()`, the Finish button silently did nothing.
 * `getRandomValues` exists everywhere. The id only has to be unique on this
 * device, so it does not need to be a UUID.
 */
export function localId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A signed-out visitor's past results, newest first. */
export function deviceHistory(): IqTestResultView[] {
	const value = read(local, HISTORY_KEY);
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((entry: unknown) => {
		if (typeof entry !== 'object' || entry === null) {
			return [];
		}
		const { id, createdAt, shareToken, ...rest } = entry as Record<string, unknown>;
		// What is posted has a seed; what is kept here does not need one.
		const parsed = iqTestResultSchema.safeParse({ seed: 0, ...rest });
		if (!(parsed.success && typeof id === 'string' && typeof createdAt === 'string')) {
			return [];
		}
		const { seed: _seed, ...view } = parsed.data;
		return [
			{
				...view,
				id,
				createdAt: new Date(createdAt),
				...(typeof shareToken === 'string' ? { shareToken } : {})
			}
		];
	});
}

export function addToDeviceHistory(result: IqTestResultView): IqTestResultView[] {
	const history = [result, ...deviceHistory()].slice(0, DEVICE_HISTORY_LIMIT);
	write(local, HISTORY_KEY, history);
	return history;
}

/** Forget every result this device kept. */
export function clearDeviceHistory(): void {
	write(local, HISTORY_KEY, null);
}

/** Give a result on this device the signed link it is shared by, once there is one. */
export function setDeviceShareToken(id: string, shareToken: string): IqTestResultView[] {
	const history = deviceHistory().map((entry) =>
		entry.id === id ? { ...entry, shareToken } : entry
	);
	write(local, HISTORY_KEY, history);
	return history;
}

export function removeFromDeviceHistory(id: string): IqTestResultView[] {
	const history = deviceHistory().filter((entry) => entry.id !== id);
	write(local, HISTORY_KEY, history);
	return history;
}
