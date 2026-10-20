import { loadLibraryPage } from '$lib/server/daydream/library-page';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadLibraryPage(event, 'ideas');
