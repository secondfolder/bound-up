import type { PageServerLoad } from './$types';
import { loadBoard } from './board.server';

export const load: PageServerLoad = (event) => loadBoard(event);
