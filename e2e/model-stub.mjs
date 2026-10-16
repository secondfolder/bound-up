// A stand-in for OpenRouter, for the Playwright suite. Started by
// `e2e/server.mjs` beside the app, which is pointed at it through
// `OPENROUTER_BASE_URL`, so a Daydreams spec never calls (or pays) a real
// model and its replies are predictable.
//
// It speaks just enough of the OpenAI-compatible streaming API the reply
// endpoint relays: `POST /v1/chat/completions` answered with `data:` events,
// a keep-alive comment like OpenRouter sends, and `data: [DONE]`.
//
// What it writes, as a passage followed by the `<meta>` block the prompt asks
// for (`src/lib/server/daydream/prompt.ts`, "Reply format"):
// - the opening, when asked to begin: "<character> looks up as you come in.";
// - a short out-of-character check-in after Stop the scene;
// - "<character> rewrites it." for a rewrite;
// - otherwise `<character> heard: "<the user's last turn>"`, with a take
//   number when the same conversation is answered again (a retried reply).
//   Counted per whole conversation, because the specs run in parallel against
//   one stub and every one of them opens the same way;
// - a 500, once, for a turn containing `[fail]`, so a spec can see a failure
//   and then "Try again" succeed.
// A scene with its heat set says so after each passage, as "(Heat: SFW.)", so a
// spec can see which level the prompt carried; one without says nothing extra.
// Every passage offers two directions ("Slower", "Surprise me") and two
// suggestions, and proposes a roll for a turn containing `[roll]`.
//
// A request that is not streamed is a setup suggestion (`api/daydreams/suggest`),
// answered with fixed JSON for whichever task it asks for. A daydream is named
// "The <scene title> story", so a spec knows what to expect, and a naming
// request fails once like any other when the scene's title has `[fail]` in it.
import { createServer } from 'node:http';

const { E2E_MODEL_PORT, E2E_MODEL_HOST = '127.0.0.1' } = process.env;
if (!E2E_MODEL_PORT) {
	console.error('e2e/model-stub.mjs is started by e2e/server.mjs, which sets its environment.');
	process.exit(2);
}

/** The key the app is given in the suite's environment (playwright.config.ts). */
const KEY = 'e2e-openrouter-key';
/**
 * How the server's prompt lists the characters (`describeSetup`): a heading
 * each, "## Mara" or, cast in a part, "## Mara, the interviewer".
 */
const CHARACTERS_HEADING = '# The characters\n## ';

/** How many times each conversation has been answered, for the take number. */
const takes = new Map();
/** Turns that have already failed once. */
const failed = new Set();

function characterName(system) {
	const at = system.indexOf(CHARACTERS_HEADING);
	if (at === -1) {
		return 'The narrator';
	}
	const rest = system.slice(at + CHARACTERS_HEADING.length);
	return rest.slice(0, rest.indexOf('\n')).split(', ')[0];
}

const ROLL = {
	prompt: 'Roll to hold still',
	sides: 6,
	outcomes: [
		{ min: 1, max: 3, label: 'You move' },
		{ min: 4, max: 6, label: 'You hold still' }
	]
};

/** "(Heat: SFW.)" for a scene whose heat is set (`describeSceneDials`), or nothing. */
function heatNote(system) {
	const level = system.match(/^Heat: (?<level>[^:]+):/m)?.groups?.level;
	return level ? ` (Heat: ${level}.)` : '';
}

function withMeta(passage, meta) {
	return `${passage}\n\n<meta>\n${JSON.stringify(meta)}\n</meta>`;
}

function replyFor(messages) {
	const system = messages.find((message) => message.role === 'system')?.content ?? '';
	const name = characterName(system);
	const heat = heatNote(system);
	const users = messages.filter((message) => message.role === 'user');
	const last = users.at(-1)?.content ?? '';
	if (system.includes('# The scene is stopped')) {
		return withMeta('Are you all right? We can carry on, gently, or stop here.', { ooc: true });
	}
	const meta = {
		suggestions: ['I kneel.', 'Tell me what happens next.'],
		directions: {
			add: [
				{ id: 'slower', label: 'Slower' },
				{ id: 'surprise-me', label: 'Surprise me' }
			],
			remove: []
		},
		readAs: 'action',
		...(last.includes('[roll]') ? { roll: ROLL } : {})
	};
	if (users.length === 1 && last.startsWith('(Begin the story')) {
		return withMeta(
			`${name} looks up as you come in.${heat}\n\nThe door clicks shut behind you.`,
			meta
		);
	}
	const conversation = JSON.stringify(messages);
	const take = (takes.get(conversation) ?? 0) + 1;
	takes.set(conversation, take);
	const takeNote = take > 1 ? ` (take ${take})` : '';
	if (last.includes('(Rewrite the passage')) {
		return withMeta(`${name} rewrites it.${takeNote}`, meta);
	}
	return withMeta(`${name} heard: "${last}"${takeNote}${heat}`, meta);
}

/** A setup suggestion's answer, as OpenRouter wraps a non-streamed completion. */
function suggestionFor(messages) {
	const ask = messages.at(-1)?.content ?? '';
	let content;
	if (ask.includes('{"chips"')) {
		content = { chips: ['stub idea', 'another stub idea'] };
	} else if (ask.includes('Invent a scene')) {
		content = {
			title: 'The stub surprise',
			setting: 'A room nobody expected',
			premise: 'Something unexpected is about to happen.',
			yourRole: 'yourself',
			tone: 'playful',
			parts: [{ name: 'the stub host', description: 'keeps the surprise going' }]
		};
	} else if (ask.includes('{"relationship"')) {
		content = { relationship: 'your stub boss', part: 'stub-testing you' };
	} else if (ask.includes('{"title": "…"}')) {
		const scene = ask.split('Its scene is "')[1]?.split('"')[0] ?? 'stub';
		content = { title: `The ${scene} story` };
	} else {
		content = { archetype: 'stub archetype', speech: 'Speaks in stubs.' };
	}
	return { choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }] };
}

/** The reply in small pieces, so the page really does show it arriving. */
function chunks(text) {
	const pieces = [];
	for (let index = 0; index < text.length; index += 12) {
		pieces.push(text.slice(index, index + 12));
	}
	return pieces;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = createServer(async (request, response) => {
	if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
		response.writeHead(404).end();
		return;
	}
	if (request.headers.authorization !== `Bearer ${KEY}`) {
		response.writeHead(401, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ error: { message: 'No auth credentials found' } }));
		return;
	}
	let raw = '';
	for await (const piece of request) {
		raw += piece;
	}
	const body = JSON.parse(raw);
	const last = body.messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';
	if (last.includes('[fail]') && !failed.has(last)) {
		failed.add(last);
		response.writeHead(500, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ error: { message: 'stub failure' } }));
		return;
	}

	if (!body.stream) {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(suggestionFor(body.messages)));
		return;
	}

	response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
	response.write(': OPENROUTER PROCESSING\n\n');
	for (const piece of chunks(replyFor(body.messages))) {
		if (response.destroyed) {
			return;
		}
		response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
		await sleep(20);
	}
	response.end('data: [DONE]\n\n');
});

server.listen(Number(E2E_MODEL_PORT), E2E_MODEL_HOST);
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => server.close(() => process.exit(0)));
}
