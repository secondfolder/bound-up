import { z } from 'zod';
import { SPACE_COLOURS } from '$lib/space-colours';

/**
 * How a partnership looks to you: a colour from the closed list, never a
 * free value (see `space-colours.ts`). Per viewer: your partner never sees
 * the colour you gave them.
 */
export const spaceColourFormSchema = z.object({
	colour: z.enum(SPACE_COLOURS, 'Choose one of the colours')
});

export type SpaceColourForm = z.output<typeof spaceColourFormSchema>;
