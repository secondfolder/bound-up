import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS, fieldText, knownField } from '../daydream';
import {
	addIdeas,
	completionJson,
	completionText,
	describeUnusable,
	GENERATED_IDEAS,
	MAX_IDEA_PREMISE,
	MAX_IDEA_TAGS,
	MAX_REPLY_DETAIL,
	parseCasting,
	parseChips,
	parseFill,
	parseGeneratedIdeas,
	parseIdeaDials,
	parseName,
	parseParts,
	parseResearch,
	parseSuggestedDaydream,
	parseSurpriseIdea
} from './suggestions';

const completion = (content: string) => ({ choices: [{ message: { content } }] });

describe('completionJson', () => {
	it('reads the JSON inside a completion, fenced or not', () => {
		expect(completionJson(completion('{"chips": ["a"]}'))).toEqual({ chips: ['a'] });
		expect(completionJson(completion('```json\n{"chips": []}\n```'))).toEqual({ chips: [] });
	});

	it('finds the JSON among words around it, as a model that read links writes', () => {
		expect(
			completionJson(
				completion(
					'Now the themes I found:\n- one\n\n```json\n{"ideas": [{"a": "}"}]}\n```\nEnjoy.'
				)
			)
		).toEqual({ ideas: [{ a: '}' }] });
		expect(completionJson(completion('Here you go: {"chips": ["a"]} — hope that helps'))).toEqual({
			chips: ['a']
		});
	});

	it('is null for anything else', () => {
		expect(completionJson(completion('Sure! Here are some ideas'))).toBeNull();
		expect(completionJson({ error: 'no' })).toBeNull();
		expect(completionJson(null)).toBeNull();
	});
});

/** A Responses API answer, as a suggestion that read a brief's links gets. */
const responses = (...output: unknown[]) => ({ output });
const message = (text: string) => ({ type: 'message', content: [{ type: 'output_text', text }] });

describe('a Responses answer', () => {
	const read = {
		type: 'openrouter:web_fetch',
		status: 'completed',
		url: 'https://www.reddit.com/r/Example/',
		title: 'r/Example',
		httpStatus: 200,
		content: 'y'.repeat(610)
	};

	it('reads the reply out of its message, past the reasoning and fetches before it', () => {
		const body = responses(
			{ type: 'reasoning', content: [{ type: 'reasoning_text', text: 'thinking' }] },
			read,
			message('{"ideas": []}')
		);
		expect(completionText(body)).toBe('{"ideas": []}');
		expect(completionJson(body)).toEqual({ ideas: [] });
		expect(completionText(responses(read))).toBeNull();
	});
});

describe('describeUnusable', () => {
	it('says whether it was no completion, not JSON, or JSON with nothing asked for, and what it was', () => {
		expect(describeUnusable({ error: 'quota' })).toBe(
			'The provider’s answer had no reply in it:\n{\n  "error": "quota"\n}'
		);
		expect(describeUnusable(completion('Sorry, I cannot help'))).toBe(
			'The reply was not JSON:\nSorry, I cannot help'
		);
		expect(describeUnusable(completion('{"chips": []}'))).toBe(
			'The reply was JSON, but nothing in it was what was asked for, or within its limits:\n{"chips": []}'
		);
	});

	it('outlines a Responses answer with no reply: how it ended, each item, and the last whole', () => {
		const said = describeUnusable({
			status: 'completed',
			incomplete_details: null,
			usage: { output_tokens: 7300 },
			model: 'not shown',
			output: [
				{ type: 'reasoning', content: [{ type: 'reasoning_text', text: 'Let me fetch' }] },
				{ type: 'openrouter:web_fetch', url: 'https://example.com', content: 'x'.repeat(30_000) },
				{ type: 'reasoning', content: [{ type: 'reasoning_text', text: 'Now the ideas' }] }
			]
		});
		expect(said).toContain(
			'had no reply in it.\nstatus: "completed"\nusage: {\n  "output_tokens": 7300\n}'
		);
		expect(said).not.toContain('incomplete_details');
		expect(said).not.toContain('not shown');
		expect(said).toMatch(
			/output: 3 items\n1\. reasoning, \d+ characters\n2\. openrouter:web_fetch, 30,\d{3} characters\n3\. reasoning/
		);
		expect(said).toContain('The last item:\n{\n  "type": "reasoning"');
		expect(said).toContain('Now the ideas');
		expect(said).not.toContain('xxxx');
	});

	it('cuts a long reply short', () => {
		const said = describeUnusable(completion('x'.repeat(MAX_REPLY_DETAIL + 50)));
		expect(said.endsWith('… (cut)')).toBe(true);
		expect(said.length).toBeLessThan(MAX_REPLY_DETAIL + 100);
	});
});

describe('parseChips', () => {
	it('keeps short, distinct phrases', () => {
		expect(
			parseChips({ chips: [' wry ', 'Wry', '', 42, 'a, b', 'x'.repeat(81), 'patient'] })
		).toEqual(['wry', 'patient']);
	});

	it('keeps at most twelve', () => {
		const chips = Array.from({ length: 20 }, (_, index) => `chip ${index}`);
		expect(parseChips({ chips })).toHaveLength(12);
	});

	it('is empty for the wrong shape', () => {
		expect(parseChips(['a'])).toEqual([]);
		expect(parseChips(null)).toEqual([]);
	});
});

describe('parseFill', () => {
	it('keeps the target’s own fields, within their caps', () => {
		expect(
			parseFill('character', {
				name: 'Mara',
				personality: ' calm ',
				premise: 'not a character field',
				speech: 7,
				appearance: 'x'.repeat(501)
			})
		).toEqual({ name: 'Mara', personality: 'calm' });
		expect(parseFill('idea', { premise: 'A bet', setting: '' })).toEqual({ premise: 'A bet' });
	});
});

describe('parseSurpriseIdea', () => {
	it('needs a title and a premise', () => {
		expect(parseSurpriseIdea({ title: 'T', premise: 'P', tone: 'tense' })).toEqual({
			title: 'T',
			premise: 'P',
			yourRole: '',
			fields: [knownField('tone', 'tense')],
			parts: [],
			openings: [],
			trackers: [],
			dials: { heat: null, kink: null }
		});
		expect(parseSurpriseIdea({ title: 'T' })).toBeNull();
	});

	it('adds the fields it named, its openings and its trackers', () => {
		const idea = parseSurpriseIdea({
			title: 'T',
			premise: 'P',
			fields: [
				{ label: 'The rule', value: 'nobody leaves', spoiler: false },
				{ label: 'The twist', value: 'she planned it', spoiler: true },
				{ label: '', value: 'no name' }
			],
			openings: [{ label: 'Three weeks in', situation: 'It is a routine now.' }],
			trackers: [
				{ name: 'Submission', kind: 'meter', start: 10, about: 'Rises when you obey.' },
				{ name: 'Mood', kind: 'feeling' }
			]
		});
		expect(idea?.fields.map(({ label, value, spoiler }) => ({ label, value, spoiler }))).toEqual([
			{ label: 'The rule', value: 'nobody leaves', spoiler: false },
			{ label: 'The twist', value: 'she planned it', spoiler: true }
		]);
		expect(idea?.openings).toEqual([
			{ label: 'Three weeks in', situation: 'It is a routine now.' }
		]);
		expect(idea?.trackers).toEqual([
			{ name: 'Submission', kind: 'meter', start: '10', about: 'Rises when you obey.' }
		]);
	});

	it('keeps a heat and kink it rated, and leaves out what is not a dial', () => {
		expect(parseSurpriseIdea({ title: 'T', premise: 'P', heat: 5, kink: 2 })?.dials).toEqual({
			heat: 5,
			kink: 2
		});
		expect(parseSurpriseIdea({ title: 'T', premise: 'P', heat: 9, kink: 2.5 })?.dials).toEqual({
			heat: null,
			kink: null
		});
	});

	it('keeps the parts it came with', () => {
		expect(
			parseSurpriseIdea({ title: 'T', premise: 'P', parts: [{ name: 'the host' }] })?.parts
		).toEqual([{ name: 'the host', description: '' }]);
	});
});

describe('parseIdeaDials', () => {
	it('takes whole numbers from 1 to 5, and nothing else', () => {
		expect(parseIdeaDials({ heat: 1, kink: 5 })).toEqual({ heat: 1, kink: 5 });
		expect(parseIdeaDials({ heat: 0, kink: '3' })).toEqual({ heat: null, kink: null });
		expect(parseIdeaDials(null)).toEqual({ heat: null, kink: null });
	});
});

describe('parseParts', () => {
	it('keeps named parts within their caps, once each, at most four', () => {
		expect(
			parseParts({
				parts: [
					{ name: ' the host ', description: ' runs it ' },
					{ name: 'The Host', description: 'again' },
					{ name: '', description: 'nobody' },
					{ name: 'x'.repeat(61) },
					{ name: 'the guest', description: 'y'.repeat(301) },
					'the butler',
					{ name: 'a' },
					{ name: 'b' },
					{ name: 'c' }
				]
			})
		).toEqual([
			{ name: 'the host', description: 'runs it' },
			// A description over its cap is dropped, not the part.
			{ name: 'the guest', description: '' },
			{ name: 'a', description: '' },
			{ name: 'b', description: '' }
		]);
	});

	it('is empty for anything that is not a list of parts', () => {
		expect(parseParts({ parts: 'the host' })).toEqual([]);
		expect(parseParts(null)).toEqual([]);
	});
});

describe('parseCasting', () => {
	it('keeps each field that fits, and is null when neither does', () => {
		expect(parseCasting({ relationship: ' your boss ', part: 'testing you' })).toEqual({
			relationship: 'your boss',
			part: 'testing you'
		});
		expect(parseCasting({ relationship: 'x'.repeat(301), part: 'testing you' })).toEqual({
			relationship: '',
			part: 'testing you'
		});
		expect(parseCasting({ relationship: 42 })).toBeNull();
		expect(parseCasting('your boss')).toBeNull();
	});
});

describe('parseName', () => {
	it('takes the name without the quotation marks a model tends to put round it', () => {
		expect(parseName({ title: '“After the meeting”' })).toBe('After the meeting');
		expect(parseName({ title: "'Late'" })).toBe('Late');
	});

	it('is null for an empty name, or one over the cap', () => {
		expect(parseName({ title: '""' })).toBeNull();
		expect(parseName({ title: 'x'.repeat(81) })).toBeNull();
		expect(parseName({ name: 'Late' })).toBeNull();
	});
});

describe('parseSuggestedDaydream', () => {
	const idea = {
		title: 'The night train',
		premise: 'A stranger takes the seat across from you.',
		heat: 2,
		kink: 9,
		parts: [{ name: 'the stranger', description: 'boarded late' }]
	};

	it('reads a monologue with nobody in it, and its sayings in the notes', () => {
		const pieces = parseSuggestedDaydream({
			voice: 'monologue',
			idea: {
				title: 'What good girls are for',
				premise: 'A voice sure of what you are for.',
				notes: 'Good girls say thank you.\nAsking is the point.',
				parts: []
			},
			characters: []
		});
		expect(pieces?.voice).toBe('monologue');
		expect(pieces?.cast).toEqual([]);
		expect(pieces?.idea.parts).toEqual([]);
		expect(fieldText(pieces?.idea.fields ?? [], 'notes')).toBe(
			'Good girls say thank you.\nAsking is the point.'
		);
	});

	it('keeps the research on the idea, and leaves the brief for the caller', () => {
		const pieces = parseSuggestedDaydream({
			voice: 'talk',
			research: 'The subreddit is captions.\nRecurring: "you asked for this".',
			idea
		});
		expect(pieces?.idea.research).toBe(
			'The subreddit is captions.\nRecurring: "you asked for this".'
		);
		expect(pieces?.idea.brief).toBeUndefined();
		expect(parseSuggestedDaydream({ voice: 'talk', idea })?.idea.research).toBe('');
	});

	it('keeps as many whole sayings as fit when they run over, where any other field is dropped', () => {
		const line = 'x'.repeat(300);
		const pieces = parseSuggestedDaydream({
			voice: 'monologue',
			idea: {
				title: 'Sayings',
				premise: 'A voice.',
				notes: [line, line, line, line].join('\n'),
				tone: 'y'.repeat(DAYDREAM_LIMITS.tone + 1)
			}
		});
		expect(fieldText(pieces?.idea.fields ?? [], 'notes')).toBe([line, line, line].join('\n'));
		expect(fieldText(pieces?.idea.fields ?? [], 'tone')).toBe('');
	});

	it('reads the voice, the idea and who is in it', () => {
		const pieces = parseSuggestedDaydream({
			voice: 'watch',
			idea,
			characters: [
				{
					name: ' Vesper ',
					archetype: 'mysterious stranger',
					part: 'the stranger',
					relationship: 'a stranger',
					doing: 'pretending to read'
				}
			]
		});
		expect(pieces).toMatchObject({
			voice: 'watch',
			idea: { title: 'The night train', dials: { heat: 2, kink: null } },
			cast: [
				{
					character: { name: 'Vesper', archetype: 'mysterious stranger', fields: [] },
					partName: 'the stranger',
					relationship: 'a stranger',
					doing: 'pretending to read'
				}
			]
		});
		expect(pieces?.cast[0]?.character.dials.libido).toBeNull();
	});

	it('leaves a voice it does not know to follow who is in it', () => {
		expect(parseSuggestedDaydream({ voice: 'chat', idea })?.voice).toBeNull();
	});

	it('drops anyone with no name, or a name already taken, and keeps at most four', () => {
		const people = [
			{ archetype: 'nameless' },
			{ name: 'Ash' },
			{ name: 'ash' },
			...['Bel', 'Cy', 'Dee', 'Eve'].map((name) => ({ name }))
		];
		const cast = parseSuggestedDaydream({ idea, characters: people })?.cast ?? [];
		expect(cast.map((person) => person.character.name)).toEqual(['Ash', 'Bel', 'Cy', 'Dee']);
	});

	it('holds a casting to its caps, empty where it does not fit', () => {
		const cast = parseSuggestedDaydream({
			idea,
			characters: [{ name: 'Ash', relationship: 'x'.repeat(301), part: 42 }]
		})?.cast;
		expect(cast?.[0]).toMatchObject({ relationship: '', partName: null });
	});

	it('reads the summary’s blanks against the characters it kept, and is fine without one', () => {
		const pieces = parseSuggestedDaydream({
			summary: '[[vesper|A stranger]] takes the seat across from you on [[idea|the train]].',
			idea,
			characters: [{ name: 'Vesper' }]
		});
		expect(pieces?.summary).toEqual([
			{
				kind: 'slot',
				slot: { kind: 'character', name: 'Vesper' },
				words: 'A stranger',
				key: 'vesper'
			},
			{ kind: 'text', text: ' takes the seat across from you on ' },
			{ kind: 'slot', slot: { kind: 'idea' }, words: 'the train', key: 'idea' },
			{ kind: 'text', text: '.' }
		]);
		expect(parseSuggestedDaydream({ idea })?.summary).toBeNull();
		expect(parseSuggestedDaydream({ summary: 'On [[idea the train', idea })).toMatchObject({
			summary: null,
			idea: { title: 'The night train' }
		});
	});

	it('is nothing without an idea that has a title and what is going on', () => {
		expect(parseSuggestedDaydream({ voice: 'talk', idea: { title: 'Only a title' } })).toBeNull();
		expect(parseSuggestedDaydream(null)).toBeNull();
	});
});

describe('parseGeneratedIdeas', () => {
	const idea = (fields: Record<string, unknown>) => ({
		title: 'Caught',
		premise: 'Your neighbour saw everything.',
		tags: ['exhibition'],
		you: 'sub',
		heat: 4,
		kink: 3,
		...fields
	});

	it('keeps each idea with its tags, its side and its level', () => {
		expect(parseGeneratedIdeas({ ideas: [idea({})] }, 'sub')).toEqual([
			{
				title: 'Caught',
				premise: 'Your neighbour saw everything.',
				tags: ['exhibition'],
				you: 'sub',
				sideFromBrief: false,
				voice: null,
				dials: { heat: 4, kink: 3 },
				research: ''
			}
		]);
	});

	it('keeps the voice an idea was suggested with, and only a voice that is one', () => {
		expect(parseGeneratedIdeas({ ideas: [idea({ voice: 'monologue' })] }, null)[0]?.voice).toBe(
			'monologue'
		);
		expect(parseGeneratedIdeas({ ideas: [idea({ voice: 'poem' })] }, null)[0]?.voice).toBeNull();
	});

	it('keeps an idea that puts the user on the other side, as the brief’s own word on it', () => {
		const answer = {
			ideas: [idea({ title: 'Mine', you: 'dom' }), idea({ title: 'Even', you: null })]
		};
		expect(
			parseGeneratedIdeas(answer, 'sub').map((kept) => [kept.title, kept.sideFromBrief])
		).toEqual([
			['Mine', true],
			['Even', false]
		]);
		// Asked for either side, no side is the brief's over the form's.
		expect(parseGeneratedIdeas(answer, null).map((kept) => kept.sideFromBrief)).toEqual([
			false,
			false
		]);
	});

	it('reads anything but the two sides as nobody in charge', () => {
		expect(parseGeneratedIdeas({ ideas: [idea({ you: 'switch' })] }, 'dom')[0]?.you).toBeNull();
	});

	it('drops an idea without a title or a premise, past its cap, or with a title already used', () => {
		const answer = {
			ideas: [
				idea({ title: '' }),
				idea({ premise: undefined }),
				idea({ title: 'x'.repeat(DAYDREAM_LIMITS.title + 1) }),
				idea({ premise: 'x'.repeat(MAX_IDEA_PREMISE + 1) }),
				idea({}),
				idea({ title: 'caught' })
			]
		};
		expect(parseGeneratedIdeas(answer, null)).toHaveLength(1);
	});

	it('cleans the tags and the dials, and keeps only the first few ideas', () => {
		const [kept] = parseGeneratedIdeas(
			{
				ideas: [
					idea({
						title: '“Quoted”',
						tags: ['Praise', 'praise', 'a, b', 7, 'x'.repeat(31), 'one', 'two', 'three', 'four'],
						heat: 9,
						kink: '3'
					})
				]
			},
			null
		);
		expect(kept?.title).toBe('Quoted');
		expect(kept?.tags).toEqual(['praise', 'one', 'two', 'three'].slice(0, MAX_IDEA_TAGS));
		expect(kept?.dials).toEqual({ heat: null, kink: null });
		const many = { ideas: Array.from({ length: 9 }, (_, at) => idea({ title: `Idea ${at}` })) };
		expect(parseGeneratedIdeas(many, null)).toHaveLength(GENERATED_IDEAS);
	});

	it('adds more ideas after the ones shown, dropping a title already there', () => {
		const [caught, other, more] = parseGeneratedIdeas(
			{ ideas: [idea({}), idea({ title: 'Other' }), idea({ title: 'More' })] },
			null
		);
		const shown = [caught, other].filter((kept) => kept !== undefined);
		const repeat = { ...(more as NonNullable<typeof more>), title: 'CAUGHT' };
		expect(addIdeas(shown, [repeat, more as NonNullable<typeof more>])).toEqual([
			caught,
			other,
			more
		]);
		expect(addIdeas(shown, [repeat])).toHaveLength(2);
	});

	it('is empty for anything that is not a list of ideas', () => {
		expect(parseGeneratedIdeas(null, null)).toEqual([]);
		expect(parseGeneratedIdeas({ ideas: 'Caught' }, null)).toEqual([]);
		expect(parseGeneratedIdeas({ ideas: [null, 'Caught'] }, null)).toEqual([]);
	});

	it('gives every idea the research its round was written with', () => {
		const ideas = parseGeneratedIdeas(
			{
				research: 'r/example: captions about being kept.\n"Good pets wait."',
				ideas: [idea({}), idea({ title: 'Kept' })]
			},
			null
		);
		expect(ideas.map((kept) => kept.research)).toEqual([
			'r/example: captions about being kept.\n"Good pets wait."',
			'r/example: captions about being kept.\n"Good pets wait."'
		]);
		expect(parseGeneratedIdeas({ ideas: [idea({})] }, null)[0]?.research).toBe('');
	});
});

describe('parseResearch', () => {
	it('keeps the notes, trimmed', () => {
		expect(parseResearch({ research: '  A page of captions.\nThemes: being kept.  ' })).toBe(
			'A page of captions.\nThemes: being kept.'
		);
	});

	it('keeps as many whole lines as fit when the notes run over', () => {
		const line = 'x'.repeat(3000);
		expect(parseResearch({ research: [line, line, line, line, line].join('\n') })).toBe(
			[line, line, line].join('\n')
		);
	});

	it('is empty for no notes, notes that are not text, or a first line too long by itself', () => {
		expect(parseResearch({})).toBe('');
		expect(parseResearch(null)).toBe('');
		expect(parseResearch({ research: ['a'] })).toBe('');
		expect(parseResearch({ research: 'x'.repeat(DAYDREAM_LIMITS.ideaResearch + 1) })).toBe('');
	});
});
