import { loadBoard } from '../board.server';
import type { PageServerLoad } from './$types';

// `/new` is the message board with its new-message dialog open, so that a
// reload keeps the dialog: the same data as the board. A static segment, so
// it wins over `[threadId]`, whose ids are UUIDs and never "new".
export const load: PageServerLoad = (event) => loadBoard(event);
