import type { Attachment } from 'svelte/attachments';

/**
 * Calls `set` with a `wa-select`'s or `wa-radio-group`'s value when it changes.
 * Listened for by hand: the change comes from a custom element whose controls
 * live in shadow roots, and Svelte's delegated `onchange` does not reliably
 * cross that boundary (AGENTS.md).
 */
export function onChoose(set: (value: string) => void): Attachment<HTMLElement> {
	return (element) => {
		const listener = () => set(String((element as HTMLElement & { value: unknown }).value));
		element.addEventListener('change', listener);
		return () => element.removeEventListener('change', listener);
	};
}

/** The same for a `wa-input`'s text as it is typed, read from the element rather than the event. */
export function onType(set: (value: string) => void): Attachment<HTMLElement> {
	return (element) => {
		const listener = () => set(String((element as HTMLElement & { value: unknown }).value ?? ''));
		element.addEventListener('input', listener);
		return () => element.removeEventListener('input', listener);
	};
}
