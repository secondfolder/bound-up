/**
 * The sealed kinds behind tasks and rewards. See `../sealed.ts` for what a kind
 * is and the rules every version follows, and docs/tasks.md / docs/rewards.md
 * for what stays plaintext beside them and why.
 *
 * A completion or a claim has no kind of its own: it keeps a copy of the
 * task's or reward's sealed record as it was, which still opens as that kind.
 */

import { z } from 'zod';
import { documentToPlainText, isRichTextDocumentEmpty, parseRichTextDocument } from '../richtext';
import { defineSealedKind } from '../sealed';

/** Generous for a few short paragraphs; the 500-character prose limit is checked inside. */
const MAX_CONTENT_CIPHERTEXT = 32 * 1024;

const title = z.string().trim().min(1).max(80);

/**
 * A rich-text description: the document's stored JSON, or null for none.
 *
 * The sanitiser the server used to be. Whatever comes out of a vault was
 * written by a device, so the document is re-parsed — which strips every key
 * the document schema does not declare — and its *visible* text is held to
 * the limit, on the way in and on the way out. An empty document is null, so
 * "no description" has one form.
 */
function richDescription(maxChars: number) {
	return z
		.string()
		.nullable()
		.transform((raw, ctx) => {
			if (raw === null || raw.trim() === '') {
				return null;
			}
			const document = parseRichTextDocument(raw);
			if (!document) {
				ctx.addIssue({ code: 'custom', message: 'Not a rich-text document' });
				return z.NEVER;
			}
			if (documentToPlainText(document).length > maxChars) {
				ctx.addIssue({ code: 'custom', message: `Over ${maxChars} characters` });
				return z.NEVER;
			}
			return isRichTextDocumentEmpty(document) ? null : JSON.stringify(document);
		});
}

export const taskKind = defineSealedKind({
	name: 'task',
	maxCiphertextLength: MAX_CONTENT_CIPHERTEXT,
	versions: [
		{
			version: 1,
			schema: z.object({
				title,
				description: richDescription(500),
				completionMessages: z.array(z.string().trim().min(1).max(1000)).max(20)
			})
		}
	]
});

export type TaskContent = z.output<typeof taskKind.latest>;

export const rewardKind = defineSealedKind({
	name: 'reward',
	maxCiphertextLength: MAX_CONTENT_CIPHERTEXT,
	versions: [{ version: 1, schema: z.object({ title, description: richDescription(500) }) }]
});

export type RewardContent = z.output<typeof rewardKind.latest>;
