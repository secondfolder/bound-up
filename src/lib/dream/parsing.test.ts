import { describe, expect, it } from 'vitest';
import { parseBuild } from './build';
import { allowedTags, parseCapabilities } from './capabilities';
import { elementLabel, parseElements, serializeElements } from './elements';
import { nextNote, parseFooter, suggestionsIn } from './footer';
import { parseMarkup } from './markup';
import { drawNudges } from './nudges';
import { pickDirection } from './pick';
import { seededRandom } from './random';
import { parseBriefReading } from './reading';
import { countOccurrences, repeatedPhrases } from './repetition';

const READING = `<musts>
- A training dynamic: someone is trained, and progress shows over time.
</musts>
<research needed="no">A familiar dynamic.</research>
<spread n="7">Open brief.</spread>
<directions>
<direction p="0.28">A sommelier trains you to taste blind.</direction>
<direction p="0.11">Told entirely as weekly progress reports.</direction>
<direction p="0.04">A transit system's new voice trains you back.</direction>
<direction p="nonsense">An unlabelled one.</direction>
<direction p="0.2"></direction>
</directions>`;

const BUILD = `<title>Week by week</title>
<telling>Ines Varga's weekly reports on the user.</telling>
<style preset="clipped">Reports in the passive voice.</style>
<presentation view="scroll" theme="paper">Reports as document blocks.</presentation>
<capabilities>blocks, stats, reveals, teleportation</capabilities>
<elements>
<character id="ines" name="Ines Varga" also="Varga, Ms Varga" name-from="Hungarian woman, born 1970s">
  <appearance>Fifties, very upright.</appearance>
  <unspoken shown="no">She is afraid to end it early.</unspoken>
</character>
<you>
  <stat name="composure" kind="meter" value="20" max="100">Rises when still.</stat>
  <stat name="rules" kind="list" value="Kneel; Eyes down">Added as issued.</stat>
</you>
<pressure>The client wants results by week eight.</pressure>
</elements>
<passage>
<block kind="report" title="Week 1">Posture. Poor.</block>
<after>
{"next": "Week 2."}
</after>
</passage>`;

describe('parseBriefReading', () => {
	const reading = parseBriefReading(READING);

	it('reads musts, research and spread', () => {
		expect(reading.musts).toEqual([
			'A training dynamic: someone is trained, and progress shows over time.'
		]);
		expect(reading.research).toEqual({ needed: false, text: 'A familiar dynamic.' });
		expect(reading.spread).toEqual({ n: 7, reason: 'Open brief.' });
	});

	it('keeps directions with text, giving a bad likelihood a small default', () => {
		expect(reading.directions.map((direction) => direction.p)).toEqual([0.28, 0.11, 0.04, 0.1]);
	});

	it('lets code pick when there is no pick tag, and only a user pick stops it', () => {
		expect(reading.pick.by).toBe('code');
		expect(parseBriefReading('<pick by="code"/>').pick.by).toBe('code');
		expect(parseBriefReading('<pick by="whoever"/>').pick.by).toBe('code');
		expect(parseBriefReading('<pick by="user">Asked to choose.</pick>').pick).toEqual({
			by: 'user',
			reason: 'Asked to choose.'
		});
	});

	it('reads a question only when it has options', () => {
		expect(parseBriefReading('<ask id="name">Use your name?</ask>').ask).toBeNull();
		expect(
			parseBriefReading('<ask id="name" keep="general">Use your name?<option>Yes</option></ask>')
				.ask
		).toEqual({ id: 'name', text: 'Use your name?', options: ['Yes'], keep: 'general' });
	});
});

describe('parseBuild', () => {
	const build = parseBuild(BUILD);

	it('reads the parts and keeps only known capabilities', () => {
		expect(build.title).toBe('Week by week');
		// A theme a model still writes is ignored: themes are gone.
		expect(build.presentation).toEqual({ view: 'scroll', notes: 'Reports as document blocks.' });
		expect(build.capabilities).toEqual(['blocks', 'stats', 'reveals']);
	});

	it('reads the writing style, defaulting to plain without one', () => {
		expect(build.style).toEqual({
			preset: 'clipped',
			notes: 'Reports in the passive voice.',
			by: 'model'
		});
		expect(parseBuild('<title>x</title>').style).toEqual({
			preset: 'plain',
			notes: '',
			by: 'model'
		});
		expect(parseBuild('<style preset="own">Short diary entries.</style>').style.preset).toBe('own');
	});

	it('reads elements of any type, with hidden fields and stats', () => {
		const [ines, you, pressure] = build.elements;
		expect(ines).toMatchObject({
			id: 'ines',
			type: 'character',
			also: ['Varga', 'Ms Varga'],
			nameFrom: 'Hungarian woman, born 1970s',
			fields: [
				{ name: 'appearance', text: 'Fifties, very upright.', shown: true },
				{ name: 'unspoken', text: 'She is afraid to end it early.', shown: false }
			]
		});
		expect(you?.stats).toEqual([
			{ name: 'composure', kind: 'meter', value: 20, max: 100, description: 'Rises when still.' },
			{
				name: 'rules',
				kind: 'list',
				value: ['Kneel', 'Eyes down'],
				description: 'Added as issued.'
			}
		]);
		expect(pressure?.fields).toEqual([
			{ name: 'description', text: 'The client wants results by week eight.', shown: true }
		]);
	});

	it('keeps the opening passage raw, to be parsed on its own', () => {
		expect(build.passage).toContain('<block kind="report" title="Week 1">');
		expect(build.passage).toContain('{"next": "Week 2."}');
	});

	it('reads back elements it wrote', () => {
		const again = parseElements(parseMarkup(serializeElements(build.elements), { final: true }));
		expect(again).toEqual(build.elements);
	});

	it('takes a footer written after </passage> as the opening passage’s own', () => {
		const { passage } = parseBuild(
			'<passage>She waits.</passage>\n<after>\n{"next": "x"}\n</after>'
		);
		expect(passage).toContain('She waits.');
		expect(passage).toContain('<after>\n{"next": "x"}\n</after>');
	});

	it('reads the heat, defaulting to steamy when it is missing or unknown', () => {
		expect(parseBuild('<heat level="Explicit"/>').heat).toBe('explicit');
		expect(parseBuild('<heat level="spicy"/>').heat).toBe('steamy');
		expect(parseBuild('').heat).toBe('steamy');
	});

	it('has no passage when the model never started one', () => {
		expect(parseBuild('<title>x</title>').passage).toBeNull();
	});
});

describe('element names', () => {
	const read = (text: string) => parseElements(parseMarkup(text, { final: true }));

	it('keeps a short name for a long one, and links and writes it back', () => {
		const [ines] = read(
			'<character id="ines" name="Ines Varga, Head of Intake" short="Ines"><manner>Clipped.</manner></character>'
		);
		expect(ines && elementLabel(ines)).toBe('Ines');
		expect(serializeElements(ines ? [ines] : [])).toContain('short="Ines"');
	});

	it('names an unnamed element from its type and the start of its description', () => {
		const [pressure] = read(
			'<pressure>The inspection on Friday decides whether she keeps the studio. Everything leans on it.</pressure>'
		);
		expect(pressure?.name).toBe('Pressure: The inspection on Friday decides whether…');
		expect(pressure?.id).toMatch(/^pressure-the-inspection/);
	});

	it('names one with nothing to go on by which of its type it is', () => {
		const elements = read('<pressure></pressure><place></place><pressure></pressure><you></you>');
		expect(elements.map((element) => element.name)).toEqual([
			'First Pressure',
			'Place',
			'Second Pressure',
			'You'
		]);
	});
});

describe('parseFooter', () => {
	it('keeps good lines and drops bad ones on their own', () => {
		const footer = parseFooter(
			[
				'{"next": "She tests the first position."}',
				'{"pref": "slower with Ines", "scope": "story"}',
				'{"new": "character", "id": "jun", "name": "Jun", "seed": "Next door."}',
				'{"set": {"you.week": 3}}',
				'not json',
				'{"new": "character", "id": "bad id!", "name": "X"}',
				'// a comment copied from an example'
			].join('\n')
		);
		expect(footer.entries.map((entry) => entry.kind)).toEqual(['next', 'pref', 'new', 'set']);
		expect(footer.dropped).toBe(2);
		expect(nextNote(footer)).toBe('She tests the first position.');
	});

	it('reads a change of writing style, and drops one that names nothing', () => {
		const footer = parseFooter(
			[
				'{"style": "dark", "notes": "Heavier now."}',
				'{"style": "own", "notes": "Clipped radio chatter."}',
				'{"style": "own"}',
				'{"style": "gothic"}'
			].join('\n')
		);
		expect(footer.entries).toEqual([
			{ kind: 'style', style: { preset: 'dark', notes: 'Heavier now.', by: 'model' } },
			{ kind: 'style', style: { preset: 'own', notes: 'Clipped radio chatter.', by: 'model' } }
		]);
		expect(footer.dropped).toBe(2);
	});

	it('reads the suggestions, each once, and drops a line of none', () => {
		const footer = parseFooter(
			['{"suggest": ["I kneel.", "I stay standing.", "I kneel."]}', '{"suggest": []}'].join('\n')
		);
		expect(suggestionsIn(footer)).toEqual(['I kneel.', 'I stay standing.']);
		expect(suggestionsIn(parseFooter('{"suggest": ["Closer.", "Not yet."]'))).toEqual([
			'Closer.',
			'Not yet.'
		]);
		expect(footer.dropped).toBe(1);
	});
});

describe('capabilities', () => {
	it('reads a list leniently and allows only their tags', () => {
		const capabilities = parseCapabilities('Stats,  reveals , stats, magic');
		expect(capabilities).toEqual(['stats', 'reveals']);
		const tags = allowedTags(capabilities);
		expect(tags.has('set')).toBe(true);
		expect(tags.has('say')).toBe(true);
		expect(tags.has('cycle')).toBe(false);
	});
});

describe('pickDirection', () => {
	const { directions } = parseBriefReading(READING);

	it('takes the only direction for a spread of 1', () => {
		expect(pickDirection(directions, 1, seededRandom(1))?.id).toBe('d1');
	});

	it('leans towards unlikely directions for a wide spread', () => {
		const counts = { wide: 0, narrow: 0 };
		const wide = seededRandom(7);
		const narrow = seededRandom(7);
		for (let run = 0; run < 2000; run += 1) {
			counts.wide += pickDirection(directions, 7, wide)?.id === 'd3' ? 1 : 0;
			counts.narrow += pickDirection(directions, 2, narrow)?.id === 'd3' ? 1 : 0;
		}
		expect(counts.wide).toBeGreaterThan(counts.narrow * 2);
	});

	it('never picks an excluded direction, and runs out cleanly', () => {
		const all = new Set(directions.map((direction) => direction.id));
		expect(pickDirection(directions, 7, seededRandom(3), all)).toBeNull();
	});

	it('is repeatable with the same seed', () => {
		const first = pickDirection(directions, 7, seededRandom(42));
		expect(pickDirection(directions, 7, seededRandom(42))).toEqual(first);
	});
});

describe('drawNudges', () => {
	it('draws from different dimensions', () => {
		const nudges = drawNudges(seededRandom(5), 3);
		expect(new Set(nudges.map((nudge) => nudge.dimension)).size).toBe(3);
		expect(nudges.every((nudge) => nudge.text)).toBe(true);
	});
});

describe('repeatedPhrases', () => {
	it('finds phrases repeated across passages, longest first, skipping filler', () => {
		const repeated = repeatedPhrases([
			'She walks a slow circle around you. It is what it is.',
			'Again she walks a slow circle. It is what it is.'
		]);
		expect(repeated).toContainEqual({ phrase: 'walks a slow circle', count: 2 });
		// Shorter phrases inside a kept one are not listed again.
		expect(repeated.some((entry) => entry.phrase === 'a slow circle')).toBe(false);
	});

	it('never lists a phrase made only of filler words', () => {
		expect(repeatedPhrases(['and it was the', 'and it was the'])).toEqual([]);
	});

	it('counts clichés case-insensitively', () => {
		expect(
			countOccurrences('A shiver ran down... a SHIVER RAN DOWN', ['a shiver ran down'])
		).toEqual({
			'a shiver ran down': 2
		});
	});
});
