import { deleteHandler, updateHandler } from '$lib/server/daydream/library-routes';

/** Edits or removes one of the user's scenes. See `library-routes.ts`. */
export const PUT = updateHandler('scenes');
export const DELETE = deleteHandler('scenes');
