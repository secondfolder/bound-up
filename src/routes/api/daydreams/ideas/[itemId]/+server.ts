import { deleteHandler, updateHandler } from '$lib/server/daydream/library-routes';

/** Edits or removes one of the user's ideas. See `library-routes.ts`. */
export const PUT = updateHandler('ideas');
export const DELETE = deleteHandler('ideas');
