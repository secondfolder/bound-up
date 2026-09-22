import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { mapWithConcurrency } from '$lib/concurrency';
import { MAX_CONCURRENT_EMBED_REQUESTS } from '$lib/embeds';
import { fetchEmbedMetadata } from '$lib/server/embed-metadata';
import type { RequestHandler } from './$types';

const requestSchema = z.object({
	urls: z.array(z.string().max(2048, 'URL too long')).max(50, 'Too many URLs')
});

/**
 * Normalises embed metadata for explicit URLs the client already extracted.
 *
 * The server still stores only ciphertext for the message body; this endpoint
 * exists so the browser can ask one first-party service to resolve preview data
 * before it encrypts that metadata into the message sidecar.
 */
export const POST: RequestHandler = async ({ locals, request, fetch }) => {
	if (!locals.user) error(401, 'Not signed in');

	const parsed = requestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Malformed request');

	const urls = [...new Set(parsed.data.urls)];
	// Capped rather than all at once: a message can carry up to 50 links, and
	// firing every provider lookup in the same instant is exactly the burst the
	// browser's embed queue exists to avoid. Per request rather than per isolate,
	// since a Worker isolate is shared by unrelated requests and a module-level
	// queue would make one person's paste slow down everyone else's.
	const embeds = (
		await mapWithConcurrency(urls, MAX_CONCURRENT_EMBED_REQUESTS, (url) =>
			fetchEmbedMetadata(url, fetch)
		)
	).filter((embed): embed is NonNullable<typeof embed> => embed !== null);

	return json(
		{ embeds },
		{
			headers: {
				// Derived from decrypted message text. Keep it request-local.
				'cache-control': 'no-store'
			}
		}
	);
};
