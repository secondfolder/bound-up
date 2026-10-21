import {
	type Axis,
	type AxisKind,
	type AxisValue,
	type Combo,
	describeCombo
} from '$lib/prompt-review';

/**
 * Every way a daydream prompt can vary, as axes to enumerate
 * (docs/prompt-review.md).
 *
 * One builder per prompt the server sends: the story's replies, and each
 * suggestion task. Each axis is one input that changes the prompt's text, with
 * every value it can take. Values are strings so a combination can sit in a
 * URL query.
 *
 * `structural` axes decide which sections a prompt has, and are crossed with
 * each other; `descriptive` ones only change what a section says, and are
 * swept one at a time from the baseline. The full product of both runs to
 * millions for the replies, almost all of it the same text again; the
 * interaction test (`prompt-catalogue.test.ts`) checks that a descriptive
 * axis really does change the same lines whatever the structural ones are,
 * which is what lets the sweep stand in for the product. An axis that fails
 * it belongs with the structural ones.
 */

export const BUILDER_IDS = [
	'reply',
	'daydream',
	'ideas',
	'fill',
	'chips',
	'surprise-idea',
	'casting',
	'name'
] as const;

export type BuilderId = (typeof BUILDER_IDS)[number];

export type Builder = { id: BuilderId; label: string; description: string; axes: readonly Axis[] };

const values = (...ids: string[]): AxisValue[] => ids.map((id) => ({ id, label: id }));

const dialValues = (unset = true) => values(...(unset ? ['unset'] : []), '1', '2', '3', '4', '5');

function axis(
	id: string,
	label: string,
	kind: AxisKind,
	axisValues: readonly AxisValue[],
	baseline?: string
): Axis {
	const [first] = axisValues;
	if (!first) {
		throw new Error(`The "${id}" axis has no values`);
	}
	return { id, label, kind, values: axisValues, baseline: baseline ?? first.id };
}

const NARRATORS = ['none', 'second-person', 'third-person', 'impersonal', 'monologue'];

/** A suggestion's narrator: the daydream around it may not have chosen one yet. */
const contextNarrator = (kind: AxisKind) =>
	axis('narrator', 'Narrator', kind, values('unset', ...NARRATORS));

const limits = axis('limits', 'Limits', 'descriptive', values('none', 'set'));

const side = axis('side', 'You as', 'structural', values('either', 'dom', 'sub'));

const links = axis(
	'links',
	'Links in the brief',
	'structural',
	values('none', 'unread', 'read'),
	'none'
);

/** The character dials, each its own axis, on the first character. */
const characterDials = [
	axis(
		'char.tone',
		'Character tone',
		'descriptive',
		values('unset', 'warm', 'teasing', 'cold', 'clinical')
	),
	...['control', 'strictness', 'edge', 'talk', 'libido', 'kink'].map((dial) =>
		axis(`char.${dial}`, `Character ${dial}`, 'descriptive', dialValues())
	)
];

const ideaRated = axis(
	'rated',
	'Idea dials already set',
	'structural',
	values('none', 'heat', 'kink', 'both')
);

export const BUILDERS: readonly Builder[] = [
	{
		id: 'reply',
		label: 'Story reply',
		description: 'Each passage of a running daydream (`buildMessages` in prompt.ts).',
		axes: [
			axis('narrator', 'Narrator', 'structural', values(...NARRATORS)),
			axis('stance', 'Stance', 'structural', values('self', 'persona', 'absent')),
			axis('characters', 'Characters', 'structural', values('0', '1', '2'), '1'),
			axis('lead', 'Lead', 'structural', values('character', 'me', 'shared')),
			axis('heat', 'Heat', 'structural', dialValues()),
			axis('pictures', 'Pictures', 'structural', values('none', 'z-image-turbo', 'sdxl', 'flux-2')),
			axis(
				'state',
				'Request',
				'structural',
				values('opening', 'reply', 'rewrite', 'stopped'),
				'reply'
			),
			axis('kink', 'Kink', 'descriptive', dialValues()),
			axis('intensity', 'Intensity', 'descriptive', dialValues(false), '3'),
			axis('pace', 'Pace', 'descriptive', dialValues(false), '3'),
			axis('length', 'Length', 'descriptive', values('short', 'medium', 'long'), 'medium'),
			axis('text', 'Fields written', 'structural', values('all', 'minimal')),
			axis('origin', 'Idea origin', 'descriptive', values('none', 'brief', 'brief+research')),
			limits,
			...characterDials
		]
	},
	{
		id: 'daydream',
		label: 'Daydream from a brief',
		description: 'A whole setup from the new-daydream page (`daydreamMessages`).',
		axes: [
			side,
			axis(
				'voice',
				'Voice kept',
				'structural',
				values('choose', 'talk', 'told', 'watch', 'rules', 'monologue')
			),
			axis('chosen', 'Picked idea', 'structural', values('no', 'yes')),
			axis('research', 'Earlier research', 'structural', values('no', 'yes')),
			links,
			limits
		]
	},
	{
		id: 'ideas',
		label: 'Ideas from a brief',
		description: '"Suggest daydreams for this" and "More ideas" (`ideasMessages`).',
		axes: [
			side,
			axis('offered', 'Already offered', 'structural', values('none', 'some')),
			links,
			limits
		]
	},
	{
		id: 'fill',
		label: 'Fill in the rest',
		description: 'A character or idea’s empty fields (`taskInstructions`, fill).',
		axes: [
			axis('target', 'Target', 'structural', values('character', 'idea')),
			contextNarrator('structural'),
			axis('written', 'Fields written', 'structural', values('name only', 'half')),
			axis('parts', 'Idea parts', 'structural', values('none', 'some')),
			ideaRated,
			axis('cast', 'Characters around it', 'descriptive', values('none', 'some')),
			axis('story', 'Story dials sent', 'descriptive', values('no', 'yes')),
			limits,
			...characterDials
		]
	},
	{
		id: 'chips',
		label: 'Chips for a field',
		description: 'Short phrases for one field (`taskInstructions`, chips).',
		axes: [
			axis('target', 'Target', 'structural', values('character', 'idea')),
			axis(
				'field',
				'Field',
				'structural',
				values(
					'archetype',
					'personality',
					'speech',
					'appearance',
					'likes',
					'notes',
					'setting',
					'premise',
					'yourRole',
					'tone'
				)
			),
			contextNarrator('structural'),
			axis('cast', 'Characters around it', 'descriptive', values('none', 'some')),
			limits
		]
	},
	{
		id: 'surprise-idea',
		label: 'Surprise idea',
		description: '"Surprise me" on an idea (`taskInstructions`, surprise-idea).',
		axes: [
			contextNarrator('structural'),
			ideaRated,
			axis('cast', 'Characters around it', 'descriptive', values('none', 'some')),
			axis('story', 'Story dials sent', 'descriptive', values('no', 'yes')),
			limits
		]
	},
	{
		id: 'casting',
		label: 'Casting',
		description: 'Who a character is in this daydream (`castingMessages`).',
		axes: [
			axis('stance', 'Stance', 'structural', values('self', 'persona', 'absent')),
			axis('part', 'Part', 'structural', values('none', 'some'), 'some'),
			axis('others', 'Others in it', 'structural', values('none', 'some')),
			limits
		]
	},
	{
		id: 'name',
		label: 'Naming',
		description: 'A name for a daydream once it opens (`nameMessages`).',
		axes: [axis('characters', 'Characters', 'structural', values('none', 'some'), 'some'), limits]
	}
];

export function builderById(id: string): Builder | undefined {
	return BUILDERS.find((builder) => builder.id === id);
}

export function baselineCombo(builder: Builder): Combo {
	return Object.fromEntries(builder.axes.map((entry) => [entry.id, entry.baseline]));
}

/**
 * A combination read from outside (a URL query), with anything missing or
 * unknown at its baseline, so a link from before an axis was added still
 * opens.
 */
export function comboFrom(
	builder: Builder,
	given: Record<string, string | null | undefined>
): Combo {
	return Object.fromEntries(
		builder.axes.map((entry) => {
			const value = given[entry.id];
			return [
				entry.id,
				value && entry.values.some((option) => option.id === value) ? value : entry.baseline
			];
		})
	);
}

/** A combination as one short line, naming only what differs from the baseline. */
export function comboLabel(builder: Builder, combo: Combo): string {
	return describeCombo(builder.axes, combo);
}
