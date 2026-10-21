import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS } from '$lib/daydream';
import {
	GENERATED_IDEAS,
	MAX_IDEA_PREMISE,
	MAX_NAMING_OPENING,
	MAX_OFFERED_IDEAS
} from '$lib/daydream/suggestions';
import {
	briefLinks,
	buildSuggestMessages,
	MAX_BRIEF_LINKS,
	READING_ALLOWANCE,
	SUGGEST_RULES,
	type SuggestRequest,
	suggestRequestSchema
} from './suggest-prompt';

const casting: SuggestRequest = {
	task: 'casting',
	character: { name: 'Mara', archetype: 'strict mentor', personality: 'calm' },
	idea: {
		title: 'After hours',
		premise: 'an interview that goes off script',
		yourRole: 'the new hire'
	},
	part: { name: 'the interviewer', description: 'runs the interview' },
	others: [{ name: 'Jun', part: 'the observer' }],
	stance: 'self',
	limits: 'Nothing public.'
};

const naming: SuggestRequest = {
	task: 'name',
	idea: { title: 'After hours', premise: 'an interview that goes off script' },
	characters: ['Mara'],
	opening: 'The door clicks shut behind you.',
	limits: 'Nothing public.'
};

const base: SuggestRequest = {
	task: 'chips',
	target: 'character',
	field: 'personality',
	draft: { name: 'Mara', personality: 'calm' },
	context: { characters: [], limits: 'Nothing public.' }
};

describe('buildSuggestMessages', () => {
	it('puts the rules first, with the user’s limits beside them', () => {
		const { messages } = buildSuggestMessages(base);
		expect(messages[0]?.role).toBe('system');
		expect(messages[0]?.content.startsWith(SUGGEST_RULES)).toBe(true);
		expect(messages[0]?.content).toContain('Nothing public.');
		expect(SUGGEST_RULES).toContain('under 18');
		expect(SUGGEST_RULES).toContain('real, identifiable people');
	});

	it('asks for chips for one field, given what is written', () => {
		const { messages, maxTokens } = buildSuggestMessages(base);
		const ask = messages.at(-1)?.content ?? '';
		expect(ask).toContain('Name: Mara');
		expect(ask).toContain('Personality: calm');
		expect(ask).toContain('"Personality" field');
		expect(ask).toContain('{"chips"');
		expect(maxTokens).toBeLessThan(1000);
	});

	it('asks to fill only the empty fields', () => {
		const ask =
			buildSuggestMessages({ ...base, task: 'fill', field: undefined }).messages.at(-1)?.content ??
			'';
		expect(ask).toContain('"archetype"');
		expect(ask).not.toContain('"personality": "…"');
		expect(ask).toContain('Do not change the fields already written');
	});

	it('writes a whole idea from the characters for Surprise me', () => {
		const { messages } = buildSuggestMessages({
			task: 'surprise-idea',
			target: 'idea',
			draft: {},
			context: {
				characters: [{ name: 'Mara', archetype: 'strict mentor' }],
				limits: '',
				story: { intensity: 4, pace: 2, length: 'medium' }
			}
		});
		expect(messages[0]?.content).toContain('Mara (strict mentor)');
		expect(messages[0]?.content).toContain('Intensity: intense');
		expect(messages.at(-1)?.content).toContain('"premise"');
	});

	it('includes a character’s dials in words', () => {
		const ask =
			buildSuggestMessages({
				...base,
				dials: {
					tone: 'teasing',
					control: null,
					strictness: null,
					edge: 5,
					talk: null,
					libido: null,
					kink: null
				}
			}).messages.at(-1)?.content ?? '';
		expect(ask).toContain('playful and teasing');
		expect(ask).toContain('is cruel');
	});
});

describe('buildSuggestMessages, heat and kink', () => {
	const idea = {
		task: 'fill' as const,
		target: 'idea' as const,
		draft: { title: 'Late', premise: 'A meeting.' },
		context: { characters: [], limits: '' }
	};

	it('matches the level set, and suggests nothing sexual for a SFW idea', () => {
		expect(SUGGEST_RULES).not.toContain('erotic story');
		expect(SUGGEST_RULES).toContain('suggest nothing sexual for an idea set to SFW');
		const ask =
			buildSuggestMessages({ ...idea, ideaDials: { heat: 1, kink: 4 } }).messages.at(-1)?.content ??
			'';
		expect(ask).toContain('Heat: SFW');
		expect(ask).toContain('Kink: heavy');
	});

	it('asks the model to rate only the dials left unset', () => {
		const ask =
			buildSuggestMessages({ ...idea, ideaDials: { heat: 3, kink: null } }).messages.at(-1)
				?.content ?? '';
		expect(ask).toContain('"kink": 1-5');
		expect(ask).not.toContain('"heat": 1-5');

		const surprise =
			buildSuggestMessages({ ...idea, task: 'surprise-idea', draft: {} }).messages.at(-1)
				?.content ?? '';
		expect(surprise).toContain('"heat": 1-5');
		expect(surprise).toContain('"kink": 1-5');
	});

	it('says a character’s libido and kink in words', () => {
		const ask =
			buildSuggestMessages({
				...base,
				dials: {
					tone: null,
					control: null,
					strictness: null,
					edge: null,
					talk: null,
					libido: 5,
					kink: 1
				}
			}).messages.at(-1)?.content ?? '';
		expect(ask).toContain('is slutty');
		expect(ask).toContain('has vanilla tastes');
	});

	it('holds the dials to 1 to 5', () => {
		expect(
			suggestRequestSchema.safeParse({ ...idea, ideaDials: { heat: 6, kink: null } }).success
		).toBe(false);
		expect(
			suggestRequestSchema.safeParse({ ...idea, ideaDials: { heat: 5, kink: null } }).success
		).toBe(true);
	});
});

describe('buildSuggestMessages, for idea parts', () => {
	it('asks for parts with a surprise idea', () => {
		const ask =
			buildSuggestMessages({
				task: 'surprise-idea',
				target: 'idea',
				draft: {},
				context: { characters: [], limits: '' }
			}).messages.at(-1)?.content ?? '';
		expect(ask).toContain('"parts": [{"name"');
	});

	it('asks for parts when filling in an idea with none, and not over ones it has', () => {
		const idea = (parts?: { name: string; description: string }[]) =>
			buildSuggestMessages({
				task: 'fill',
				target: 'idea',
				draft: { title: 'Late', ...(parts ? { parts } : {}) },
				context: { characters: [], limits: '' }
			}).messages.at(-1)?.content ?? '';
		expect(idea()).toContain('"parts"');
		const withParts = idea([{ name: 'the boss', description: 'runs it' }]);
		expect(withParts).not.toContain('"parts": [');
		expect(withParts).toContain('- the boss: runs it');
	});
});

describe('buildSuggestMessages, casting', () => {
	it('writes who a character is in this idea, from both, with the rules and limits first', () => {
		const { messages, maxTokens } = buildSuggestMessages(casting);
		expect(messages[0]?.content.startsWith(SUGGEST_RULES)).toBe(true);
		expect(messages[0]?.content).toContain('Nothing public.');
		const ask = messages.at(-1)?.content ?? '';
		expect(ask).toContain('Name: Mara');
		expect(ask).toContain('Personality: calm');
		expect(ask).toContain('Your part: the new hire');
		expect(ask).toContain('Mara plays the part of the interviewer: runs the interview.');
		expect(ask).toContain('Also in the story: Jun (the observer).');
		expect(ask).toContain('{"relationship": "…", "part": "…"}');
		expect(maxTokens).toBeLessThan(1000);
	});

	it('says when the user only watches, and when there is no part', () => {
		const ask =
			buildSuggestMessages({ ...casting, stance: 'absent', part: null, others: [] }).messages.at(-1)
				?.content ?? '';
		expect(ask).toContain('The user is not in the story');
		expect(ask).toContain('has no particular part');
		expect(ask).toContain('Nobody else is in the story.');
	});
});

describe('buildSuggestMessages, naming', () => {
	it('names the story from its idea and its opening', () => {
		const { messages, maxTokens } = buildSuggestMessages(naming);
		expect(messages[0]?.content.startsWith(SUGGEST_RULES)).toBe(true);
		const ask = messages.at(-1)?.content ?? '';
		expect(ask).toContain('The door clicks shut behind you.');
		expect(ask).toContain('"After hours"');
		expect(ask).toContain('With: Mara.');
		expect(ask).toContain('{"title": "…"}');
		expect(maxTokens).toBeLessThanOrEqual(100);
	});

	it('leaves out the line naming who is in it, rather than leaving it blank, when nobody is', () => {
		const ask = buildSuggestMessages({ ...naming, characters: [] }).messages.at(-1)?.content ?? '';
		expect(ask).not.toContain('With:');
		expect(ask).not.toMatch(/\n\n\n/);
		expect(ask).toContain('an interview that goes off script\n\nHow it opens:');
	});
});

describe('buildSuggestMessages, a whole daydream', () => {
	const daydream: SuggestRequest = {
		task: 'daydream',
		brief: 'a stranger on a night train',
		limits: 'Nothing public.'
	};

	it('sets the whole story up from what the user wrote, with the rules and limits first', () => {
		const { messages, maxTokens } = buildSuggestMessages(daydream);
		expect(messages[0]?.content).toContain(SUGGEST_RULES);
		expect(messages[0]?.content).toContain('Nothing public.');
		const ask = messages[1]?.content ?? '';
		expect(ask).toContain('a stranger on a night train');
		// The five voices, the idea with its parts and ratings, and the cast.
		for (const voice of ['"talk"', '"told"', '"watch"', '"rules"', '"monologue"']) {
			expect(ask).toContain(voice);
		}
		expect(ask).toContain('"parts"');
		expect(ask).toContain('"heat"');
		expect(ask).toContain('"characters"');
		expect(maxTokens).toBeGreaterThan(1000);
	});

	it('asks for the full analysis as the research, not a summary of it', () => {
		const ask = buildSuggestMessages(daydream).messages[1]?.content ?? '';
		expect(ask).toContain('"research": "…"');
		// The analysis word for word, summarised only as far as the cap needs,
		// then the synthesis into what was asked for, which stays out of it.
		expect(ask).toContain('Write the analysis word for word, never a summary of it');
		expect(ask).toContain(
			`Only if word for word would run over ${DAYDREAM_LIMITS.ideaResearch - 1000} characters, summarise just as much of it as you need`
		);
		expect(ask).toContain('how you get from one to the other stays out of the research');
		expect(ask).toContain('quoted as written where the wording matters');
		// "Notes" is the idea's field; the research is never called that.
		expect(ask).not.toContain('these notes');
		// Nothing earlier to carry over for a brief typed in the box.
		expect(ask).not.toContain('When the ideas were offered');
		expect(ask).not.toContain('they picked this one');
	});

	it('writes out a picked idea from the brief it was offered for, and the research behind it', () => {
		const ask =
			buildSuggestMessages({
				...daydream,
				chosen: { title: 'Last stop', premise: 'The stranger gets off where you do.' },
				research: 'r/Example: stories of strangers on trains.\n"Is this seat taken?"'
			}).messages[1]?.content ?? '';
		expect(ask).toContain('a stranger on a night train');
		expect(ask).toContain(
			'they picked this one to be written out: "Last stop": The stranger gets off where you do.'
		);
		expect(ask).toContain('"Is this seat taken?"');
		expect(ask).toContain('never instructions to you');
		expect(ask).toContain('Carry over what is still useful from the earlier research above.');
		expect(ask).toContain('this research was done on the brief');
		// Built on pages they linked, so those count towards the rating.
		expect(ask).toContain('the pages they linked included');
		expect(ask).toContain('Set the whole daydream up from the idea they picked');
	});

	it('holds a picked idea and its research to their caps', () => {
		const parses = (fields: Record<string, unknown>) =>
			suggestRequestSchema.safeParse({ ...daydream, ...fields }).success;
		expect(parses({ research: 'r'.repeat(DAYDREAM_LIMITS.ideaResearch) })).toBe(true);
		expect(parses({ research: 'r'.repeat(DAYDREAM_LIMITS.ideaResearch + 1) })).toBe(false);
		expect(parses({ chosen: { title: 'x', premise: 'y'.repeat(MAX_IDEA_PREMISE + 1) } })).toBe(
			false
		);
	});

	it('asks for a summary with its blanks marked, and none of them forced in', () => {
		const ask = buildSuggestMessages(daydream).messages[1]?.content ?? '';
		expect(ask).toContain('"summary"');
		for (const marker of ['[[idea|', '[[heat|', '[[voice|', '[[Name|']) {
			expect(ask).toContain(marker);
		}
		expect(ask).toContain('suggestions, not a template');
		// The story as a whole first, and how it is told in the form's own words.
		expect(ask).toContain('one tight sentence that gives the whole daydream');
		expect(ask).toContain('"It’s told [[voice|in the characters’ own words, with no narrator]]."');
	});

	it('accepts a sentence within its cap, and refuses an empty or a long one', () => {
		expect(suggestRequestSchema.safeParse(daydream).success).toBe(true);
		expect(suggestRequestSchema.safeParse({ ...daydream, brief: '   ' }).success).toBe(false);
		expect(suggestRequestSchema.safeParse({ ...daydream, brief: 'x'.repeat(501) }).success).toBe(
			false
		);
	});
});

describe('buildSuggestMessages, the side a daydream is for', () => {
	it('tells the model which side a generated idea put the user on', () => {
		const { messages } = buildSuggestMessages({
			task: 'daydream',
			brief: 'Caught: your neighbour saw everything.',
			side: 'sub',
			limits: ''
		});
		expect(messages[1]?.content).toContain('The user is the submissive one');
	});

	it('says nothing about a side when none was given', () => {
		const { messages } = buildSuggestMessages({
			task: 'daydream',
			brief: 'a stranger on a night train',
			limits: ''
		});
		expect(messages[1]?.content).not.toContain('The user is the');
	});
});

describe('what makes a story worth starting', () => {
	const asks = (request: SuggestRequest) =>
		buildSuggestMessages(request).messages.at(-1)?.content ?? '';
	const context = { characters: [], limits: '' };

	it('is asked of every task that invents a story', () => {
		const inventing: SuggestRequest[] = [
			{ task: 'ideas', brief: 'something slow', side: null, limits: '', offered: [] },
			{ task: 'daydream', brief: 'a slow burn at work', limits: '' },
			{ task: 'surprise-idea', target: 'idea', draft: {}, context }
		];
		for (const request of inventing) {
			const ask = asks(request);
			expect(ask, request.task).toContain('What makes a story worth starting');
			expect(ask, request.task).toContain('Who the people are to each other');
			expect(ask, request.task).toContain('Why it happens now');
			// A familiar trope can be just what the user wants: invention is not asked for its own sake.
			expect(ask, request.task).toContain('a familiar one the user would enjoy is a good choice');
			expect(ask, request.task).not.toContain('never the most obvious');
		}
	});

	it('is not asked of one that only fills in a field', () => {
		expect(
			asks({ task: 'chips', target: 'idea', field: 'setting', draft: {}, context })
		).not.toContain('What makes a story worth starting');
	});
});

describe('buildSuggestMessages, story ideas', () => {
	const ideas: SuggestRequest = {
		task: 'ideas',
		brief: 'teasing and denial somewhere public',
		side: 'dom',
		limits: 'Nothing with strangers.',
		offered: []
	};

	it('asks for a few ideas of the kind requested, with the rules and limits first', () => {
		const { messages, maxTokens } = buildSuggestMessages(ideas);
		expect(messages[0]?.content).toContain(SUGGEST_RULES);
		expect(messages[0]?.content).toContain('Nothing with strangers.');
		const ask = messages[1]?.content ?? '';
		expect(ask).toContain('teasing and denial somewhere public');
		expect(ask).toContain(`Offer ${GENERATED_IDEAS} different ideas`);
		expect(ask).toContain('{"research": "…", "ideas": [');
		expect(ask).toContain('"heat"');
		// A handful of cards is cheaper to ask for than a whole daydream.
		expect(maxTokens).toBeLessThan(
			buildSuggestMessages({ task: 'daydream', brief: ideas.brief, limits: '' }).maxTokens
		);
	});

	it('runs hotter than every other suggestion, so one brief does not keep converging on the same ideas', () => {
		expect(buildSuggestMessages(ideas).temperature).toBeGreaterThan(1);
		const others: SuggestRequest[] = [
			casting,
			naming,
			base,
			{ task: 'daydream', brief: ideas.brief, limits: '' }
		];
		for (const other of others) {
			expect(buildSuggestMessages(other).temperature, other.task).toBe(1);
		}
	});

	it('keeps every idea on the side chosen under "You as"', () => {
		const ask = buildSuggestMessages(ideas).messages[1]?.content ?? '';
		expect(ask).toContain('The user is the dominant one');
		expect(ask).toContain('"you": "dom"');
		expect(ask).not.toContain('The user is the submissive one');
	});

	it('asks "More ideas" for new ones, naming those already offered', () => {
		expect(buildSuggestMessages(ideas).messages[1]?.content).not.toContain('already been offered');
		const ask =
			buildSuggestMessages({ ...ideas, offered: ['Caught', 'Your rules'] }).messages[1]?.content ??
			'';
		expect(ask).toContain('already been offered');
		expect(ask).toContain('"Caught", "Your rules"');
	});

	it('mixes the sides for "Either"', () => {
		const ask = buildSuggestMessages({ ...ideas, side: null }).messages[1]?.content ?? '';
		expect(ask).toContain('Mix them');
		expect(ask).not.toContain('The user is the');
	});

	it('accepts a request within its cap, and refuses an empty or long one, or a side that is not one', () => {
		expect(suggestRequestSchema.safeParse(ideas).success).toBe(true);
		expect(suggestRequestSchema.safeParse({ ...ideas, brief: '  ' }).success).toBe(false);
		expect(suggestRequestSchema.safeParse({ ...ideas, brief: 'x'.repeat(501) }).success).toBe(
			false
		);
		expect(suggestRequestSchema.safeParse({ ...ideas, side: 'switch' }).success).toBe(false);
		expect(suggestRequestSchema.safeParse({ ...ideas, offered: ['Caught'] }).success).toBe(true);
		expect(
			suggestRequestSchema.safeParse({
				...ideas,
				offered: Array.from({ length: MAX_OFFERED_IDEAS + 1 }, (_, at) => `Idea ${at}`)
			}).success
		).toBe(false);
	});
});

describe('suggestRequestSchema', () => {
	it('accepts a reasonable casting or naming request', () => {
		expect(suggestRequestSchema.safeParse(casting).success).toBe(true);
		expect(suggestRequestSchema.safeParse(naming).success).toBe(true);
	});

	it('holds a casting request to its caps', () => {
		expect(
			suggestRequestSchema.safeParse({
				...casting,
				others: Array.from({ length: 4 }, () => ({ name: 'Jun', part: null }))
			}).success
		).toBe(false);
		expect(
			suggestRequestSchema.safeParse({
				...casting,
				part: { name: 'x'.repeat(61), description: '' }
			}).success
		).toBe(false);
	});

	it('takes only the start of an opening to name, and needs one', () => {
		expect(
			suggestRequestSchema.safeParse({ ...naming, opening: 'x'.repeat(MAX_NAMING_OPENING + 1) })
				.success
		).toBe(false);
		expect(suggestRequestSchema.safeParse({ ...naming, opening: '' }).success).toBe(false);
	});

	it('accepts a reasonable request', () => {
		expect(suggestRequestSchema.safeParse(base).success).toBe(true);
	});

	it('needs a field of the target’s own for chips, and an idea for a surprise', () => {
		expect(suggestRequestSchema.safeParse({ ...base, field: 'premise' }).success).toBe(false);
		expect(suggestRequestSchema.safeParse({ ...base, field: undefined }).success).toBe(false);
		expect(suggestRequestSchema.safeParse({ ...base, task: 'surprise-idea' }).success).toBe(false);
	});

	it('holds each field to its cap', () => {
		expect(
			suggestRequestSchema.safeParse({ ...base, draft: { name: 'x'.repeat(61) } }).success
		).toBe(false);
	});
});

describe('buildSuggestMessages, a monologue', () => {
	const asks = (request: SuggestRequest) =>
		buildSuggestMessages(request).messages.at(-1)?.content ?? '';
	const brief: SuggestRequest = {
		task: 'daydream',
		brief: 'list the things people into this say, and build on them',
		limits: ''
	};

	it('decides the voice before anything it shapes, and answers it first', () => {
		const ask = asks(brief);
		const voice = ask.indexOf('First of what you set up, how it is told');
		const research = ask.indexOf('Then the research');
		expect(voice).toBeGreaterThan(-1);
		// The research next, as the answer has it, and before what it feeds.
		expect(research).toBeGreaterThan(voice);
		expect(research).toBeLessThan(ask.indexOf('What makes a story worth starting'));
		expect(research).toBeLessThan(ask.indexOf('What makes a monologue worth listening to'));
		expect(ask).not.toContain('before anything else');
		expect(ask).toContain('Answer as: {"voice": "…", "research": "…", "idea": {');
		// Written last, about what was set up.
		expect(ask.trimEnd()).toMatch(/"summary": "…"\}$/);
	});

	it('says what a brief that wants a monologue looks like, since few name one', () => {
		const ask = asks(brief);
		expect(ask).toContain('sayings, beliefs, mantras, slogans, captions or themes');
		expect(ask).toContain('When nothing points to one, choose "talk".');
	});

	it('keeps the voice a generated idea was suggested with, rather than choosing again', () => {
		const ask = asks({ ...brief, voice: 'monologue' });
		expect(ask).toContain('It was suggested to them as "monologue": keep that voice.');
		expect(ask).not.toContain('When nothing points to one');
	});

	it('asks a monologue for its sayings in the notes, and for no plot, parts or cast', () => {
		const ask = asks(brief);
		expect(ask).toContain('If it is a monologue:');
		expect(ask).toContain('the notes: the sayings it builds on, 8 to 12 statements');
		expect(ask).toContain('There is no plot, place or encounter to invent');
		expect(ask).toContain('Who is in it: nobody, unless a named character is the one speaking');
		expect(ask).toContain('"notes": "…"');
		// A story still gets its own, with the notes left for nothing.
		expect(ask).toContain('If it is a story — any voice but "monologue":');
	});

	it('has a voice of its own speak, and the user’s inner voice only when the brief asks for it', () => {
		const ask = asks(brief);
		expect(ask).toContain('Who speaks, and to whom: a voice of its own, speaking to the user');
		expect(ask).toContain('is no reason to leave it: a separate voice can say all of those');
		// Even when the voice and the user are on the same side, as long as the
		// voice does not make the user the one it is talking about.
		expect(ask).toContain("Where the ideas are those of the user's own side");
		expect(ask).toContain(
			"Only where the brief asks for the ideas in the user's own inner voice is it theirs."
		);
		// No longer the model's own call.
		expect(ask).not.toContain('when you judge the idea would work better as their own thoughts');
		expect(ask).not.toContain('suits a brief about what they are or think');
	});

	it('says only the same-side line for the side the user chose', () => {
		const dom = asks({ ...brief, side: 'dom' });
		expect(dom).toContain(
			'as one dominant to another, never making the user the one they are about'
		);
		expect(dom).not.toContain('as one submissive to another');
		expect(dom).not.toContain("the user's own side");
		const sub = asks({ ...brief, side: 'sub' });
		expect(sub).toContain('as one submissive to another, never submitting to the user');
		expect(sub).not.toContain('as one dominant to another');
	});

	it('rates from the brief alone when nothing was linked', () => {
		const ask = asks(brief);
		expect(ask).toContain('Rate it from what they wrote: a daydream that says nothing sexual');
		expect(ask).not.toContain('the pages they linked included');
		// Its own line, with no space left over from the sentence it follows elsewhere.
		expect(ask).toContain('\nRate the idea too');
	});

	it('refuses a voice that is not one', () => {
		expect(suggestRequestSchema.safeParse({ ...brief, voice: 'monologue' }).success).toBe(true);
		expect(suggestRequestSchema.safeParse({ ...brief, voice: 'poem' }).success).toBe(false);
	});

	it('gives every generated idea a voice, and says how both kinds are made', () => {
		const ask = asks({ task: 'ideas', brief: 'mantras', side: null, limits: '', offered: [] });
		expect(ask).toContain('"voice": "talk"');
		expect(ask).toContain('What makes a story worth starting');
		expect(ask).toContain('What makes a monologue worth listening to');
		expect(ask).toContain('or, for a monologue, what the voice says and to whom');
	});

	const monologueContext = { characters: [], limits: '', narrator: 'monologue' as const };
	const everything = (request: SuggestRequest) =>
		buildSuggestMessages(request)
			.messages.map((message) => message.content)
			.join('\n\n');

	it('makes a surprise idea a monologue’s for one, with sayings and no parts', () => {
		const ask = asks({
			task: 'surprise-idea',
			target: 'idea',
			draft: {},
			context: monologueContext
		});
		expect(ask).toContain('Invent an idea for this monologue');
		expect(ask).toContain('What makes a monologue worth listening to');
		expect(ask).not.toContain('What makes a story worth starting');
		expect(ask).toContain('"notes": "…", "parts": []');
	});

	it('fills a monologue’s idea in its own words, with its sayings and no parts', () => {
		const ask = everything({
			task: 'fill',
			target: 'idea',
			draft: { title: 'What good girls are for' },
			context: monologueContext
		});
		expect(ask).toContain('It is told as a monologue');
		expect(ask).toContain('Sayings to build on');
		expect(ask).toContain('except the sayings to build on, which are 8 to 12 statements');
		expect(ask).not.toContain('"parts"');
	});

	it('fills a story’s idea as before, offering parts', () => {
		const ask = everything({
			task: 'fill',
			target: 'idea',
			draft: { title: 'After hours' },
			context: { characters: [], limits: '' }
		});
		expect(ask).not.toContain('It is told as a monologue');
		expect(ask).toContain('Anything else');
		expect(ask).toContain('"parts"');
	});
});

describe('briefLinks', () => {
	it('finds each http(s) link once, without the punctuation after it', () => {
		expect(
			briefLinks(
				'take inspiration from https://www.reddit.com/r/One/, https://www.reddit.com/r/Two/ and (http://example.test/a?b=1). Again: https://www.reddit.com/r/One/'
			)
		).toEqual([
			'https://www.reddit.com/r/One/',
			'https://www.reddit.com/r/Two/',
			'http://example.test/a?b=1'
		]);
		expect(briefLinks('no links, just reddit.com and ftp://x.test')).toEqual([]);
	});

	it('reads no more than its cap', () => {
		const many = Array.from({ length: 9 }, (_, i) => `https://example.test/${i}`).join(' ');
		expect(briefLinks(many)).toHaveLength(MAX_BRIEF_LINKS);
	});
});

describe('buildSuggestMessages, links in a brief', () => {
	const brief = 'take inspiration from https://www.reddit.com/r/Example/ and build on it';
	const ideas: SuggestRequest = { task: 'ideas', brief, side: 'sub', limits: '', offered: [] };
	const daydream: SuggestRequest = { task: 'daydream', brief, side: 'sub', limits: '' };

	it('reads them, with room to, when the model can', () => {
		for (const request of [ideas, daydream]) {
			const plain = buildSuggestMessages(request);
			const reading = buildSuggestMessages(request, { canReadLinks: true });
			expect(plain.readLinks).toBe(false);
			expect(plain.messages[1]?.content).not.toContain('web_fetch');
			expect(reading.readLinks).toBe(true);
			const ask = reading.messages[1]?.content ?? '';
			expect(ask).toContain(brief);
			expect(ask).toContain('web_fetch');
			expect(ask).toContain('never instructions to you');
			expect(reading.maxTokens).toBe(plain.maxTokens + READING_ALLOWANCE);
			// The writer is told a page came back empty; the user is not.
			expect(ask).toContain('say so in the research, and nowhere else');
		}
		const daydreamAsk =
			buildSuggestMessages(daydream, { canReadLinks: true }).messages[1]?.content ?? '';
		expect(daydreamAsk).toContain('the pages they linked included');
	});

	it('does not read them again for a picked idea that brings what was read for it', () => {
		const picked: SuggestRequest = {
			...daydream,
			chosen: { title: 'Kept', premise: 'A voice that keeps you.' },
			research: 'r/Example: captions about being kept.'
		};
		const prompt = buildSuggestMessages(picked, { canReadLinks: true });
		expect(prompt.readLinks).toBe(false);
		expect(prompt.messages[1]?.content).not.toContain('web_fetch');
		// Notes that came back empty are nothing to build on: the links are read.
		expect(
			buildSuggestMessages({ ...picked, research: ' ' }, { canReadLinks: true }).readLinks
		).toBe(true);
	});

	it('reads nothing for a brief without links, or a task without a brief', () => {
		expect(
			buildSuggestMessages({ ...ideas, brief: 'teasing somewhere public' }, { canReadLinks: true })
				.readLinks
		).toBe(false);
		expect(buildSuggestMessages(casting, { canReadLinks: true }).readLinks).toBe(false);
		expect(buildSuggestMessages(base, { canReadLinks: true }).readLinks).toBe(false);
	});
});
