import { error } from '@sveltejs/kit';
import { FORMAT_FILES } from '$lib/image-playground';
import { playgroundHistory, requirePlayground } from '$lib/server/image-playground';
import type { RequestHandler } from './$types';

const TYPES = Object.fromEntries(
	Object.values(FORMAT_FILES).map(({ extension, contentType }) => [extension, contentType])
) as Record<string, string>;

/** One picture from the picture playground's history (docs/debug-mode.md, "Picture playground"). */
export const GET: RequestHandler = async ({ locals, params }) => {
	await requirePlayground(locals);
	const bytes = await (await playgroundHistory())?.readPicture(params.file);
	if (!bytes) {
		error(404, 'That picture is not kept any more.');
	}
	const extension = params.file.split('.').pop() ?? '';
	return new Response(bytes as Uint8Array<ArrayBuffer>, {
		headers: {
			'content-type': TYPES[extension] ?? 'application/octet-stream',
			// Never changes once written, and it is this admin's alone.
			'cache-control': 'private, max-age=31536000, immutable'
		}
	});
};
