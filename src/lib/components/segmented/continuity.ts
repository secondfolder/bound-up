/**
 * Which option a keyed segmented control last showed, so the same control on
 * the next page can slide its fill from there rather than appear already on
 * its own option. `/tasks` and `/rewards` each draw the Tasks | Rewards pill
 * in their own layout, so navigating between them tears one down and builds
 * the other: there is no element left to animate, only a memory of where it
 * was.
 *
 * Module state, but browser-only: it is written and read only from effects,
 * which never run on the server, so it is not a server singleton shared
 * between requests.
 */

type Shown = {
	value: string;
	/** The control showing it now, or null once that control is gone. */
	owner: object | null;
	/** When the owner went, in `performance.now()` time. */
	releasedAt: number;
};

const shown = new Map<string, Shown>();

/**
 * Long enough to cover a navigation's load, short enough that coming back to
 * the page later, by way of somewhere else, does not slide from a choice
 * made minutes ago.
 */
const WINDOW_MS = 1000;

/**
 * Takes the key for `owner`, showing `value`, and returns the option the
 * previous holder was showing if it should slide from there: one still
 * mounted (SvelteKit may build the new page before it destroys the old), or
 * one gone within the window.
 */
export function arrive(key: string, owner: object, value: string | undefined): string | undefined {
	const previous = shown.get(key);
	shown.set(key, { value: value ?? '', owner, releasedAt: 0 });
	if (
		!previous ||
		previous.value === value ||
		(previous.owner === null && performance.now() - previous.releasedAt > WINDOW_MS)
	) {
		return undefined;
	}
	return previous.value;
}

/** Records a new choice, if `owner` still holds the key. */
export function hold(key: string, owner: object, value: string | undefined): void {
	const current = shown.get(key);
	if (current?.owner === owner) {
		current.value = value ?? '';
	}
}

/**
 * Lets go of the key, keeping the value for whoever arrives next. A later
 * control that has already taken the key keeps it: an old page destroyed
 * after the new one mounted must not overwrite what the new one shows.
 */
export function leave(key: string, owner: object): void {
	const current = shown.get(key);
	if (current?.owner === owner) {
		current.owner = null;
		current.releasedAt = performance.now();
	}
}
