/**
 * What lives in the Playroom: kink toys, games and lists that are not
 * sessions or tasks. The /playroom index lists these, in this order.
 *
 * Alias-free and data only. A tool is either a standalone page outside the
 * app shell, which can be shared and used without an account (the IQ test),
 * or a page in the app shell with a public twin of its own for anyone
 * signed out (the kink list) — see docs/playroom.md.
 */
export type PlayroomTool = {
	id: string;
	name: string;
	blurb: string;
	/** A Font Awesome name, as `wa-icon` takes it. */
	icon: string;
	/** The tool's route id, for `resolve()`. */
	route: '/(standalone)/playroom/iq-test/[[id]]' | '/(auth-required)/(app)/playroom/kink-list';
};

export const PLAYROOM_TOOLS: readonly PlayroomTool[] = [
	{
		id: 'kink-list',
		name: 'Kink list',
		blurb: "What you're into, what you're curious about, and your hard limits.",
		icon: 'list-ul',
		route: '/(auth-required)/(app)/playroom/kink-list'
	},
	{
		id: 'iq-test',
		name: 'IQ test',
		// Never hints that a dom and a sub are marked differently: it is read
		// before either takes the test (see docs/playroom.md, "The rigging").
		blurb: "Do you know what you're talking about or are you just a dumb little slut?",
		icon: 'brain',
		route: '/(standalone)/playroom/iq-test/[[id]]'
	}
];
