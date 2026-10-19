import { categoryFromParam } from '$lib/kink-list/category-param';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => categoryFromParam(params.category);
