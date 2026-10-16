/**
 * What lives in the Playroom: small kink toys that are not sessions, notebook
 * pages or tasks. The /playroom index lists these, in this order.
 *
 * Alias-free and data only. Each tool is its own standalone page, outside the
 * app shell, so it can be shared and used without an account — see
 * docs/playroom.md.
 */
export type PlayroomTool = {
	id: string;
	name: string;
	blurb: string;
	/** A Font Awesome name, as `wa-icon` takes it. */
	icon: string;
	/** The tool's route id, for `resolve()`. Every tool sits in `(standalone)`. */
	route: '/(standalone)/playroom/iq-test/[[id]]';
};

export const PLAYROOM_TOOLS: readonly PlayroomTool[] = [
	{
		id: 'iq-test',
		name: 'IQ test',
		blurb: "Do you know what you're talking about or are you just a dumb little slut?",
		icon: 'brain',
		route: '/(standalone)/playroom/iq-test/[[id]]'
	}
];
