/**
 * Saving a ticked to-do item in a task's or reward's description, from the
 * sheet that shows it rather than its edit form.
 *
 * BROWSER ONLY — it seals with `sealed-forms.ts`.
 *
 * The description is part of the record's sealed content, so a tick is a new
 * sealed record: the content as opened, the new description in place of the
 * old, sealed into the same vault and posted on its own to the list page's
 * `…Content` action. Not the edit form's action, which takes the settings
 * too and works the schedule out again from them. See docs/rich-text.md,
 * "To-do lists".
 */

import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import { reportRequestFailure, tryFetch } from './request-failure.svelte';
import type { SealedKind } from './sealed';
import { type SealScope, sealForSubmit } from './sealed-forms';

/** Where a record's ticks are saved, given only to a viewer who may edit it. */
export type ContentSaveTarget = {
	/** The list page's action that takes the record's sealed content alone. */
	action: string;
	scope: SealScope;
};

/**
 * A function that saves a new description for one record and resolves to
 * whether it saved, for `RichText`'s `onChecklistToggle`.
 *
 * **One save at a time, and only the latest.** Each tick posts the whole
 * description at the revision it was opened at, so two in flight together
 * would refuse the second as a conflict with the first. A tick made while
 * another is saving waits for it; one overtaken by a later tick is not sent
 * at all, since the later one carries it.
 *
 * `current` reads the record as last loaded, live. After a save the record
 * is a revision on, which this remembers until the reload that follows has
 * caught up, so a second tick straight after the first does not post the old
 * revision.
 */
export function descriptionSaver<Content extends { description: string | null }>(options: {
	kind: SealedKind<Content>;
	target: ContentSaveTarget;
	recordId: string;
	current: () => { revision: number; content: Content };
	/** Fields the action needs beside the sealed record, from the content being saved. */
	fields?: (content: Content) => Record<string, string>;
	/** A refusal the server explained, for the sheet to say inline. */
	onRefused: (message: string) => void;
}): (description: string) => Promise<boolean> {
	let saved: { revision: number; content: Content } | null = null;
	/** Counts the ticks, so a queued one can tell it has been overtaken. */
	let tick = 0;
	let queue: Promise<unknown> = Promise.resolve();

	async function post(description: string): Promise<boolean> {
		const loaded = options.current();
		const from = saved && saved.revision > loaded.revision ? saved : loaded;
		const content = { ...from.content, description };
		const sealed = await sealForSubmit(options.kind, {
			scope: options.target.scope,
			recordId: options.recordId,
			payload: content,
			describe: () => 'That change could not be saved. Reload and try again.'
		});
		if (!sealed.ok) {
			options.onRefused(sealed.error);
			return false;
		}

		const body = new FormData();
		const fields = {
			...sealed.fields,
			expectedRevision: String(from.revision),
			...options.fields?.(content)
		};
		for (const [name, value] of Object.entries(fields)) {
			body.set(name, value);
		}
		const response = await tryFetch(options.target.action, {
			method: 'POST',
			body,
			// What `use:enhance` sends, so SvelteKit answers with an action
			// result rather than a page.
			headers: { 'x-sveltekit-action': 'true' }
		});
		if (!response) {
			reportRequestFailure(null);
			return false;
		}
		const result = deserialize(await response.text());
		if (result.type === 'success') {
			saved = { revision: from.revision + 1, content };
			// The list and the sheet read the new record, and the edit form
			// opens at the revision just written.
			await invalidateAll();
			return true;
		}
		if (result.type === 'failure') {
			const said = result.data?.error;
			options.onRefused(
				typeof said === 'string' ? said : 'That change could not be saved. Reload and try again.'
			);
			return false;
		}
		reportRequestFailure(result.type === 'error' ? result : response);
		return false;
	}

	return (description) => {
		tick += 1;
		const mine = tick;
		const done = queue
			.then(() => (mine === tick ? post(description) : true))
			.catch((cause: unknown) => {
				reportRequestFailure(cause);
				return false;
			});
		queue = done;
		return done;
	};
}
