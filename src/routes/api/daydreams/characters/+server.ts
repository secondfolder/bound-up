import { createHandler } from '$lib/server/daydream/library-routes';

/** Adds to the user's characters library. See `library-routes.ts`. */
export const POST = createHandler('characters');
