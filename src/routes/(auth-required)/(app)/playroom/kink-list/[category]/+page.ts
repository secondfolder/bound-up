import { error } from '@sveltejs/kit';
import { kinkById } from '$lib/kink-list/catalog';
import type { PageLoad } from './$types';

/** A category of the catalogue, or a 404 for anything else (a kink's id is not a category). */
export const load: PageLoad = ({ params }) => {
	const category = kinkById(params.category);
	if (!category || category.parent !== undefined) {
		error(404, 'There is no such category.');
	}
	return { categoryId: category.id };
};
