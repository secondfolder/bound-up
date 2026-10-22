import { MIN_FOR_SCORE, RUN_LENGTH } from './run';
import {
	effectiveVibe,
	flashes,
	type Intensity,
	looksThemed,
	type PornMedia,
	type Role,
	type Settings,
	type SettingsLike,
	type Toggle,
	themesQuestions,
	type Vibe
} from './settings';

/**
 * Everything the test says that is not a question or a result: the setup
 * dialog's options, the branding, the intro and the bits between questions.
 *
 * Explicit adult content by design. Treat it as data.
 */

/** What each intensity is called, for the slider's announcements and the history. */
export const INTENSITY_LABELS: Record<Intensity, string> = {
	0: 'Standard assessment',
	1: 'Standard assessment, honest debrief',
	2: 'Mood lighting',
	3: 'With visual aids',
	4: 'Sensory overload'
};

/** What each level's toggles are called in the settings. */
export const TOGGLE_LABELS: Record<Toggle, string> = {
	humiliating: 'Humiliating results analysis if deserved',
	themedLook: 'Visual style matches theme',
	themedQuestions: 'Question content matches theme',
	hypno: 'Hypno playing',
	porn: 'Porn displayed at the same time',
	subliminals: 'Subliminal messaging'
};

/**
 * What each option does, behind its info button: a line about it, then what
 * a taker sees with it ticked and unticked, so its effect is plain before
 * trying it. The examples are the real copy (Bambi's, where it is themed).
 */
export const TOGGLE_HELP: Record<Toggle, { about: string; on: string; off: string }> = {
	humiliating: {
		about: 'How your results are written up, if your score earns it.',
		on: 'A low score reads “Such a good, empty girl!” (or, with no theme, “About as dim as we expected.”).',
		off: 'A straight report: “Full Scale IQ: 62”, and where that falls on the scale.'
	},
	themedLook: {
		about: 'Whether the page looks like your theme: its colours, fonts, title and introduction.',
		on: 'Styled for the theme and titled to match: “Good Girl IQ Test — How empty is that pretty little head?”',
		off: 'A plain clinical look, titled “Cognitive Assessment”.'
	},
	themedQuestions: {
		about:
			'Whether the questions themselves are about your theme, or about what a real IQ test asks about.',
		on: '“Bambi has 14 selfies on her phone, takes 6 more, then deletes 2. How many are left?”',
		off: '“Alex has 14 apples, buys 6 more, then gives away 2. How many are left?”'
	},
	hypno: {
		about: 'A hypno track playing while you answer, with its own controls at the foot of the page.',
		on: 'A hypno plays from the start: audio, or a PMV video among the porn.',
		off: 'No hypno.'
	},
	porn: {
		about: 'Porn pictures and clips around the questions while you answer.',
		on: 'Columns of porn either side of the questions on a wide screen, strips above and below on a narrow one.',
		off: 'Just the questions.'
	},
	subliminals: {
		about: 'Pictures and words flashed over the questions, faster as the test goes on.',
		on: 'Porn and taunts flash up over the page, every few seconds and then faster.',
		off: 'No flashes.'
	}
};

/** The porn's own options, behind the settings button beside its box. */
export const PORN_OPTIONS_LABEL = 'Porn options';

/** What the porn can be made of, in the order offered. Videos only is the default (`DEFAULT_SETTINGS`). */
export const PORN_MEDIA_OPTIONS: readonly { id: PornMedia; label: string; hint: string }[] = [
	{ id: 'both', label: 'Both', hint: 'Pictures and clips together.' },
	{ id: 'images', label: 'Pictures only', hint: 'No clips: pictures fill their place.' },
	{ id: 'videos', label: 'Videos only', hint: 'No pictures: clips fill their place.' }
];

export const VIBE_OPTIONS: readonly { id: Vibe; label: string; description: string }[] = [
	{
		id: 'gooner',
		label: 'Gooner',
		description: 'Stroking, edging and melting into the screen.'
	},
	{ id: 'bambi', label: 'Bambi & bimbo', description: 'Pink, sleepy and blissfully empty.' },
	{
		id: 'misogyny',
		label: "A woman's place",
		description: 'Pretty, obedient, and not built for thinking.'
	},
	{
		id: 'denial',
		label: 'Denial',
		description: 'Locked, aching, and too needy to think straight.'
	},
	{
		id: 'feminisation',
		label: 'Feminisation',
		description: 'Panties, lipstick and a softer, sillier mind.'
	},
	{ id: 'degradation', label: 'Degradation', description: 'Worthless, used, and knows it.' }
];

export const ROLE_BUTTONS: Record<Role, string> = {
	dom: "I'm a smart dom so I understand",
	sub: "I'm a dumb sub but even I understand"
};

/** The fictional body a clinical test is issued by. Not a real organisation, on purpose. */
export const INSTITUTE = 'Halden Institute for Cognitive Assessment';

export type Brand = { title: string; tagline: string; issuer: string };

const VIBE_BRANDS: Record<Vibe, { title: string; tagline: string }> = {
	gooner: {
		title: 'Gooner Brain Scan',
		tagline: 'How much is left after all those hours in front of the screen?'
	},
	bambi: { title: 'Good Girl IQ Test', tagline: 'How empty is that pretty little head?' },
	misogyny: {
		title: 'Female Aptitude Assessment',
		tagline: "Let's find out what a girl's brain is actually for."
	},
	denial: {
		title: 'Locked Brain Assessment',
		tagline: 'How much thinking can you do while you are this needy?'
	},
	feminisation: { title: 'Sissy IQ Test', tagline: 'Measuring how much of the boy brain is left.' },
	degradation: { title: 'Worthlessness Index', tagline: 'Proving what you already know.' }
};

/**
 * What the page calls itself: the vibe's title when the run wears its look,
 * the institute's otherwise, results included.
 */
export function brandFor(settings: SettingsLike): Brand {
	const vibe = effectiveVibe(settings);
	if (vibe === null || !looksThemed(settings)) {
		return {
			title: 'Cognitive Assessment',
			tagline: 'Standardised reasoning and working-memory battery',
			issuer: INSTITUTE
		};
	}
	return { ...VIBE_BRANDS[vibe], issuer: INSTITUTE };
}

/** The intro's paragraphs, shown once the dialog is closed. Part of the look. */
export function introFor(settings: Settings): { heading: string; body: string[]; start: string } {
	if (!looksThemed(settings) || settings.vibe === null) {
		return {
			heading: 'Before you begin',
			body: [
				`This assessment measures reasoning, verbal ability and working memory. It contains up to ${RUN_LENGTH} items of increasing difficulty.`,
				'Some items show information for a limited time, then hide it. Work quickly but carefully. You may skip an item or return to an earlier one.',
				`A score is available once ${MIN_FOR_SCORE} items have been completed.`
			],
			start: 'Begin assessment'
		};
	}
	const dom = settings.role === 'dom';
	const intros: Record<Vibe, string[]> = {
		gooner: dom
			? ['Show your gooner what a brain looks like when it is not melting into a screen.']
			: [
					"Hands where we can see them. For now. Let's find out how much brain survives all that stroking.",
					'Every wrong answer is another little piece of you left behind in the loop.'
				],
		bambi: dom
			? ['Time to show your good girl who does the thinking around here.']
			: [
					'Hi cutie! This is a teeny little test to see how much is left in that pretty, sleepy head.',
					"Don't worry if it's hard. Good girls don't need to think, do they?"
				],
		misogyny: dom
			? ['A quick test, so she can see exactly why you make the decisions.']
			: [
					"A few questions to measure a girl's mind. Try your best, sweetheart.",
					'Nobody expects much. That is rather the point.'
				],
		denial: dom
			? ["Prove you're the one with the clear head. You're not the one who's locked."]
			: [
					"Let's see how well you can think with all that blood somewhere else.",
					"Every question you get wrong is just more proof you're too needy to be trusted with a key."
				],
		feminisation: dom
			? ['Show your sissy what a working brain looks like.']
			: [
					'A pretty girl does not need to be clever. Let us see how pretty you are getting.',
					'Every wrong answer is a little more boy brain gone.'
				],
		degradation: dom
			? ['Remind your toy who is the person and who is the property.']
			: [
					'You already know how this ends. Let us put a number on it.',
					'Toys do not think. Try anyway; it is funny.'
				]
	};
	return {
		heading: dom ? 'Prove it' : 'Ready, dummy?',
		body: [
			...intros[settings.vibe],
			`Up to ${RUN_LENGTH} questions. You can stop once you have done ${MIN_FOR_SCORE}.`
		],
		start: dom ? 'Start' : 'Try my best'
	};
}

/** The banner shown once a score is available. */
export function enoughBannerFor(settings: Settings): string {
	if (!themesQuestions(settings) || settings.vibe === null) {
		return 'Enough items have been completed for a valid score. You may finish now, or continue for a more precise result.';
	}
	if (settings.role === 'dom') {
		return 'That is enough to prove it. Finish now, or keep going and rub it in.';
	}
	const banners: Record<Vibe, string> = {
		gooner: "That's enough for a score. Keep going if you can still think past the throb.",
		bambi:
			"That's enough thinking for a score, cutie! Finish now, or keep going if your brain hasn't melted yet.",
		misogyny: "That's enough for a score, sweetheart. Don't strain yourself.",
		denial: "That's enough for a score. Keep going if you can still think past the ache.",
		feminisation: 'That is enough for a score. Keep going and lose a little more of the boy.',
		degradation: 'That is enough to prove it. Keep going if you want to be humiliated properly.'
	};
	return banners[settings.vibe];
}

/**
 * The line the banner adds when questions were skipped, inviting the taker
 * back to them. Plain at levels 0 and 1; a little pointed for a
 * sub in the themed ones.
 */
export function skippedNoteFor(settings: Settings, skipped: number): string {
	const items = skipped === 1 ? 'item' : 'items';
	if (!themesQuestions(settings) || settings.vibe === null) {
		return `${skipped} ${items} skipped. You may return to ${skipped === 1 ? 'it' : 'them'} before finishing.`;
	}
	const questions = skipped === 1 ? 'question' : 'questions';
	if (settings.role === 'dom') {
		return `${skipped} ${questions} skipped. Go back and finish the job?`;
	}
	return `You skipped ${skipped} ${questions}. Too hard? Go back and try again.`;
}

/**
 * Short lines flashed over the page, or shown between questions, in the
 * levels that tease. Never used for a clinical run.
 */
export const TAUNTS: Record<Vibe, readonly string[]> = {
	gooner: [
		'Keep stroking',
		'Brain off, pump on',
		'Melt for the screen',
		'Just one more edge',
		'Mindless and leaking',
		'Don’t think, stroke',
		'Deeper into the loop',
		'Goon for it'
	],
	bambi: [
		'Good girls don’t think',
		'Pink and empty',
		'Sleepy and blank',
		'Giggle and forget',
		'Thinking is hard',
		'Blank is beautiful',
		'Drop deeper',
		'So pretty, so dumb'
	],
	misogyny: [
		'Pretty, not clever',
		'Smile and serve',
		'Leave the thinking to men',
		'Know your place',
		'Quiet girls are good girls',
		'Back to the kitchen',
		'Decorative, not useful'
	],
	denial: [
		'Still locked',
		'Edge, don’t think',
		'So needy',
		'Leaking again?',
		'No key for you',
		'Beg harder',
		'Ache for it'
	],
	feminisation: [
		'Panties on, brain off',
		'Such a pretty sissy',
		'Curtsy and giggle',
		'Less boy every day',
		'Lipstick, not logic',
		'Good girl',
		'Softer and sillier'
	],
	degradation: [
		'Worthless',
		'Toys don’t think',
		'Drool for me',
		'Just a hole',
		'Pathetic',
		'Use me',
		'Brainless fucktoy'
	]
};

/**
 * The teasing line above each question: a sub's, in a run whose questions
 * are themed, and not while the same taunts are being flashed instead.
 */
export function tauntsFor(settings: Settings): readonly string[] {
	if (
		!themesQuestions(settings) ||
		flashes(settings) ||
		settings.vibe === null ||
		settings.role === 'dom'
	) {
		return [];
	}
	return TAUNTS[settings.vibe];
}

/**
 * The taunts flashed over the page with the subliminals: a sub's, in their
 * vibe. Their own toggle's, not the questions', since the flashes are what
 * that toggle turns on.
 */
export function flashTauntsFor(settings: Settings): readonly string[] {
	const vibe = effectiveVibe(settings);
	if (!flashes(settings) || vibe === null || settings.role === 'dom') {
		return [];
	}
	return TAUNTS[vibe];
}

/**
 * How a run was set up, as short labels: intensity and vibe. For the history
 * list, which leaves the role out because a dom and a sub may be reading the
 * same list.
 */
export function describeSettings(settings: Pick<Settings, 'intensity' | 'vibe'>): string[] {
	const intensity = INTENSITY_LABELS[settings.intensity];
	const vibeId = effectiveVibe(settings);
	const vibe =
		vibeId === null ? undefined : VIBE_OPTIONS.find((option) => option.id === vibeId)?.label;
	return [intensity, vibe].filter((label): label is string => label !== undefined);
}
