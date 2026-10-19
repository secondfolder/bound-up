import { error } from '@sveltejs/kit';
import { kinkById } from './catalog';

/**
 * A `[category]` route param as a catalogue category, or a 404 for anything
 * else — a kink's id is not a category. Shared by the signed-in and
 * signed-out category pages.
 */
export function categoryFromParam(param: string): { categoryId: string } {
	const category = kinkById(param);
	if (!category || category.parent !== undefined) {
		error(404, 'There is no such category.');
	}
	return { categoryId: category.id };
}
