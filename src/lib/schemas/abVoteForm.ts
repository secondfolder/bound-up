import { z } from 'zod';

/**
 * A blind A/B vote on /debug/dreams (docs/dreams.md, "Quality tools"). The
 * pair is opaque to the page; the server turns the side back into a version.
 */
export const abVoteForm = z.object({
	pair: z.string().min(1).max(2000),
	choice: z.enum(['left', 'tie', 'right']).default('tie'),
	samey: z.boolean().default(false),
	offBrief: z.boolean().default(false),
	tooMuchMarkup: z.boolean().default(false),
	flat: z.boolean().default(false),
	loved: z.boolean().default(false)
});

export type AbVoteForm = z.output<typeof abVoteForm>;
