import { deleteHandler, updateHandler } from '$lib/server/daydream/library-routes';

/** Edits or removes one of the user's characters. See `library-routes.ts`. */
export const PUT = updateHandler('characters');
export const DELETE = deleteHandler('characters');
