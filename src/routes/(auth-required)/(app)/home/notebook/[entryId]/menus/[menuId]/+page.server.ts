import { loadSceneMenu } from '$lib/server/notebook-pages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadSceneMenu(event, { kind: 'self' });
