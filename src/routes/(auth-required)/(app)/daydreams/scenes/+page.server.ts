import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The library's ideas were "scenes" until a monologue, which has no scene,
// made the word wrong (docs/daydreams.md, "Ideas"); an old link still lands.
export const load: PageServerLoad = () => {
	redirect(308, '/daydreams/ideas');
};
