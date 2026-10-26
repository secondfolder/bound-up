// A stand-in for OpenRouter, for the Playwright suite. Started by
// `e2e/server.mjs` beside the app, which is pointed at it through
// `OPENROUTER_BASE_URL`, so a Daydreams spec never calls (or pays) a real
// model and its replies are predictable. It also stands in for Runware
// (`/runware`) and, for a Workers run, Resend (`/resend/emails`; see `email`).
//
// It speaks just enough of the OpenAI-compatible streaming API the reply
// endpoint relays: `POST /v1/chat/completions` answered with `data:` events,
// a keep-alive comment like OpenRouter sends, a first event of reasoning
// ("The stub thinks it over."), the reply, its finish reason, a usage event
// when the request asks for one (as a debug-mode reply does), and
// `data: [DONE]`. Every event names the model and a provider, as
// OpenRouter's do, so the raw log has something to show for them.
//
// What it writes, as a passage followed by the `<meta>` block the prompt asks
// for (`src/lib/server/daydream/prompt.ts`, "Reply format"):
// - the opening, when asked to begin: "<character> looks up as you come in.",
//   then a second paragraph in italics, "*The door clicks shut behind you.*",
//   so selecting and highlighting words is exercised across hidden markup
//   (docs/daydreams.md, "Reading a passage");
// - a monologue's opening, asked for in its own words: a bold statement on a
//   line of its own, "**The stub voice says its piece.**", then "And then a
//   little more.", so a spec sees the statement drawn as a standout line;
// - a short out-of-character check-in after Stop the scene;
// - "<character> rewrites it." for a rewrite;
// - for another take (Write again), the take it was shown, numbered one on:
//   `<character> heard: "…" (take 2)` after the first, so a spec sees the
//   replaced take reached the model (`anotherTakeRequest`);
// - otherwise `<character> heard: "<the user's last turn>"`, with a take
//   number when the same conversation is answered again (a retried reply).
//   Counted per whole conversation, because the specs run in parallel against
//   one stub and every one of them opens the same way;
// - a 500, once, for a turn containing `[fail]`, so a spec can see a failure
//   and then "Try again" succeed;
// - for a turn containing `[write out]`, the turn written out first, as
//   `<yours>Written out: <the turn></yours>`, opening with the reading
//   `<reading>instruction</reading>`; and for one containing `[direction]`,
//   `<reading>direction</reading>`. Every other turn is read, in the
//   metadata, as an action.
// An idea with its heat set says so after each passage, as "(Heat: SFW.)", so a
// spec can see which level the prompt carried; one without says nothing extra.
// Every passage offers two directions ("Slower", "Surprise me") and two
// suggestions, and proposes a roll for a turn containing `[roll]`.
// - a first passage asked to start from one of the idea's openings is
//   "<character> picks it up at: <the opening's name>.";
// - a turn containing `[thought]` gets the character's thought after the
//   passage, `<thought who="<character>">The stub keeps this to itself.</thought>`;
// - a turn containing `[track]` moves a tracker exactly as the prompt's own
//   example does (`describeTrackers`), so a spec sees the readout move.
//
// A request that asks for a JSON object (`response_format`) is a setup
// suggestion (`api/daydreams/suggest`), answered with fixed JSON for whichever
// task it asks for: streamed when asked to be, as the endpoint does — a first
// event of reasoning ("The stub weighs the brief."), then the JSON in pieces —
// and whole when not. A brief containing `[slow]` streams slowly, so a spec
// can watch the progress line count up before the answer lands. The Responses
// API (`POST /v1/responses`, for a model that reads a brief's links) answers
// the same JSON streamed its way, after a fetch of the first link it was given. A daydream is named
// "The <idea title> story", so a spec knows what to expect, and a naming
// request fails once like any other when the idea's title has `[fail]` in it.
// A daydream described in a sentence is always "The stub night train", with
// Vesper cast as its stranger, and a summary that marks the heat, the idea and
// Vesper but leaves how it is told for the form to add — unless the brief asks
// for sayings, or it is an idea suggested as a monologue, when it is "The stub
// sayings", a monologue with nobody in it and its sayings in the notes.
// Generated ideas are one for each side and one
// with nobody in charge, the first titled for the side the prompt asked for
// ("Stub idea for the sub"), so a spec can see the side reach the model.
// Asked for more, having been told what it already offered, each title ends
// ", again", so "More ideas" has something new to add. The one with nobody in charge is a monologue.
// The night train and the ideas both come with research notes of their own,
// so a spec can see them kept on the idea, and carried to a picked idea.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { E2E_RESEND_KEY } from './settings.mjs';

const { E2E_MODEL_PORT, E2E_MODEL_HOST = '127.0.0.1', E2E_RUN_DIR } = process.env;
if (!E2E_MODEL_PORT) {
	console.error('e2e/model-stub.mjs is started by e2e/server.mjs, which sets its environment.');
	process.exit(2);
}

/** The key the app is given in the suite's environment (playwright.config.ts). */
const KEY = 'e2e-openrouter-key';
const RUNWARE_KEY = 'e2e-runware-key';

/** A real 1×1 WEBP, so the page has a picture it can show. */
const PICTURE = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
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

/** "(Heat: SFW.)" for an idea whose heat is set (`describeIdeaDials`), or nothing. */
function heatNote(system) {
	// One line only: an unset heat says so on a line with no colon after
	// "Heat:", which would otherwise run on into the next line's.
	const level = system.match(/^The idea's heat: (?<level>[^:\n]+):/m)?.groups?.level;
	return level ? ` (Heat: ${level}.)` : '';
}

/**
 * The user's last message without the buttons note every request ends with
 * (`buttonsNote` in `server/daydream/prompt.ts`), so the stub echoes what
 * the user sent rather than what the app adds for the model.
 */
function lastUserMessage(messages) {
	const content = messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';
	return content
		.replace(/\n\n\(What the story keeps track of now: [^\n]*\)$/, '')
		.replace(/\n\n\(Direction buttons on screen now: [^\n]*\)$/, '');
}

/** The idea's opening a first passage is asked to start from (`openingRequest`), by its name. */
const OPENING = /<opening>\n(?<label>[^:\n]+):/;

/** The tracker move the prompt gives as its example (`describeTrackers`), which the stub makes. */
const TRACKER_EXAMPLE = /like (?<example>\{"trackers": \{[^\n]*?\}\})/;

/** The take another take replaces, as `anotherTakeRequest` quotes it. */
const ANOTHER_TAKE = /another take on a passage you wrote[^\n]*\n"{3}\n(?<take>[\s\S]*?)\n"{3}/;

function withMeta(passage, meta) {
	return `${passage}\n\n<meta>\n${JSON.stringify(meta)}\n</meta>`;
}

function replyFor(messages) {
	const system = messages.find((message) => message.role === 'system')?.content ?? '';
	const name = characterName(system);
	const heat = heatNote(system);
	const users = messages.filter((message) => message.role === 'user');
	const last = lastUserMessage(messages);
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
		...(last.includes('[roll]') ? { roll: ROLL } : {}),
		// A picture only when asked, so the other specs' pages stay as they were.
		...(last.includes('[picture]') ? { image: 'A woman in her thirties at a desk' } : {}),
		// A tracker moved only when asked, as the prompt's own example moves it.
		...(last.includes('[track]')
			? JSON.parse(system.match(TRACKER_EXAMPLE)?.groups?.example ?? '{}')
			: {})
	};
	// What a character thinks, only when asked, so the other specs' passages stay as they were.
	const thought = last.includes('[thought]')
		? ` <thought who="${name}">The stub keeps this to itself.</thought>`
		: '';
	const opening = last.match(OPENING)?.groups?.label;
	if (users.length === 1 && opening) {
		return withMeta(`${name} picks it up at: ${opening}.${heat}`, meta);
	}
	if (users.length === 1 && last.startsWith('(Begin. Open straight into the monologue')) {
		return withMeta(`**The stub voice says its piece.**\n\nAnd then a little more.${heat}`, meta);
	}
	if (users.length === 1 && last.startsWith('(Begin the story')) {
		return withMeta(
			`${name} looks up as you come in.${heat}\n\n*The door clicks shut behind you.*`,
			meta
		);
	}
	const shown = last.match(ANOTHER_TAKE);
	if (shown?.groups) {
		const previous = shown.groups.take.match(/ \(take (?<number>\d+)\)/);
		const number = Number(previous?.groups ? previous.groups.number : 1) + 1;
		const passage = shown.groups.take
			.replace(/^<yours>\n[\s\S]*?\n<\/yours>\n/, '')
			.replace(/ \(take \d+\)/, '');
		return withMeta(
			passage.replace(/^(?<heard>.*? heard: ".*?")/, `$<heard> (take ${number})`),
			meta
		);
	}
	const conversation = JSON.stringify(messages);
	const take = (takes.get(conversation) ?? 0) + 1;
	takes.set(conversation, take);
	const takeNote = take > 1 ? ` (take ${take})` : '';
	if (last.includes('(Your next passage replaces one')) {
		return withMeta(`${name} rewrites it.${takeNote}`, meta);
	}
	if (last.includes('[write out]')) {
		return `<reading>instruction</reading>\n<yours>\nWritten out: ${last}\n</yours>\n${withMeta(`${name} heard: "${last}"${takeNote}${heat}`, meta)}`;
	}
	if (last.includes('[direction]')) {
		return `<reading>direction</reading>\n${withMeta(`${name} heard: "${last}"${takeNote}${heat}`, meta)}`;
	}
	return withMeta(`${name} heard: "${last}"${takeNote}${heat}${thought}`, meta);
}

/** A setup suggestion's answer, as OpenRouter wraps a non-streamed completion. */
function suggestionFor(messages) {
	const ask = messages.at(-1)?.content ?? '';
	let content;
	const brief = ask.match(/<brief>\n(?<brief>[\s\S]*?)\n<\/brief>/)?.groups?.brief ?? '';
	// A whole daydream's answer starts with its voice (`daydreamAnswer`).
	const wholeDaydream = ask.includes('{"voice": "…"');
	if (
		wholeDaydream &&
		(brief.includes('sayings') || ask.includes('suggested to them as "monologue"'))
	) {
		content = {
			voice: 'monologue',
			idea: {
				title: 'The stub sayings',
				setting: '',
				premise: 'A voice sure of what you are for.',
				yourRole: 'the one it speaks to',
				tone: 'certain',
				notes: 'Good stubs say thank you.\nAsking is the point.',
				heat: 3,
				kink: 3,
				parts: []
			},
			characters: [],
			summary:
				'[[idea|A voice that knows exactly what a stub is for]], and tells you so. It’s told [[voice|as a monologue, one voice speaking its mind]].'
		};
	} else if (wholeDaydream) {
		content = {
			summary:
				'[[idea|A stranger on the stub night train]]. [[Vesper|A watchful stranger called Vesper]] takes the seat across from you, and the journey turns [[heat|slow-burning]].',
			voice: 'talk',
			research: 'Stub notes: night trains, and the strangers who share them.',
			idea: {
				title: 'The stub night train',
				setting: 'a sleeper carriage',
				premise: 'A stranger takes the seat across from you.',
				yourRole: 'a passenger',
				tone: 'mysterious',
				heat: 2,
				kink: 1,
				parts: [{ name: 'the stranger', description: 'boarded at the last stop' }]
			},
			characters: [
				{
					name: 'Vesper',
					archetype: 'mysterious stranger',
					personality: 'watchful',
					part: 'the stranger',
					relationship: 'a stranger on the train',
					doing: 'pretending to read'
				}
			]
		};
	} else if (ask.includes('"ideas": [{"title"')) {
		const side = ask.match(/the side chosen, the (?<side>dominant|submissive) one/)?.groups?.side;
		const asked = { dominant: 'dom', submissive: 'sub' }[side] ?? 'either';
		const again = ask.includes('already been offered') ? ', again' : '';
		content = {
			research: 'Stub notes on what was asked for.',
			ideas: [
				{
					title: `Stub idea for the ${asked}${again}`,
					premise: 'A stub premise.',
					tags: ['stub'],
					you: asked === 'either' ? 'sub' : asked,
					heat: 3,
					kink: 2
				},
				{
					title: `Stub idea for the dom${again}`,
					premise: 'In charge.',
					you: 'dom',
					heat: 4,
					kink: 4
				},
				{
					title: `Stub idea for nobody${again}`,
					premise: 'Even.',
					you: null,
					voice: 'monologue',
					heat: 2,
					kink: 1
				}
			]
		};
	} else if (ask.includes('{"ideas":[{"title":"…","why"')) {
		// A scene's "What might we have missed?" (src/lib/scenes/model-help.ts).
		content = {
			ideas: [{ title: 'Stub: water within reach?', why: 'A stub reason.', section: 'prep' }]
		};
	} else if (ask.includes('{"courses"')) {
		// A scene's "Suggest a menu".
		content = { courses: [{ name: 'Stub starters', items: ['stub massage', 'stub kisses'] }] };
	} else if (ask.includes('{"chips"')) {
		content = { chips: ['stub idea', 'another stub idea'] };
	} else if (ask.includes('Invent an idea')) {
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
		const idea = ask.match(/^Title: (?<title>.*)$/m)?.groups?.title ?? 'stub';
		content = { title: `The ${idea} story` };
	} else {
		content = { archetype: 'stub archetype', speech: 'Speaks in stubs.' };
	}
	return { choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }] };
}

/** How long between pieces of a suggestion: long for a brief that asks for `[slow]`. */
function suggestionPace(messages) {
	return (messages.at(-1)?.content ?? '').includes('[slow]') ? 60 : 5;
}

/** A setup suggestion, streamed as Chat Completions streams one. */
async function streamSuggestion(body, response) {
	response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
	response.write(': OPENROUTER PROCESSING\n\n');
	const event = (fields) =>
		`data: ${JSON.stringify({ id: 'gen-stub', model: body.model, provider: 'Stub', ...fields })}\n\n`;
	response.write(event({ choices: [{ delta: { reasoning: 'The stub weighs the brief.' } }] }));
	const pace = suggestionPace(body.messages);
	for (const piece of chunks(suggestionFor(body.messages).choices[0].message.content)) {
		if (response.destroyed) {
			return;
		}
		response.write(event({ choices: [{ delta: { content: piece } }] }));
		await sleep(pace);
	}
	response.write(event({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
	response.end('data: [DONE]\n\n');
}

/**
 * A suggestion that reads links, streamed as OpenRouter's Responses API
 * streams one: a fetch of the first link in the brief, then the answer.
 */
async function streamResponses(body, response) {
	response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
	const event = (type, fields) =>
		`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
	const messages = body.input;
	const url =
		(messages.at(-1)?.content ?? '').match(/https?:\/\/\S+/)?.[0] ?? 'https://example.test/';
	const fetched = {
		type: 'openrouter:web_fetch',
		id: 'fetch-stub',
		status: 'completed',
		url,
		title: 'A stub page',
		content: 'What the stub page says.'
	};
	const text = suggestionFor(messages).choices[0].message.content;
	const message = {
		type: 'message',
		id: 'msg-stub',
		role: 'assistant',
		status: 'completed',
		content: [{ type: 'output_text', text }]
	};
	response.write(
		event('response.created', { response: { id: 'resp-stub', status: 'in_progress' } })
	);
	response.write(
		event('response.output_item.added', { item: { ...fetched, status: 'in_progress' } })
	);
	await sleep(suggestionPace(messages));
	response.write(event('response.output_item.done', { item: fetched }));
	response.write(event('response.output_item.added', { item: { ...message, content: [] } }));
	for (const piece of chunks(text)) {
		if (response.destroyed) {
			return;
		}
		response.write(event('response.output_text.delta', { delta: piece }));
		await sleep(suggestionPace(messages));
	}
	response.write(event('response.output_item.done', { item: message }));
	response.write(
		event('response.completed', {
			response: { id: 'resp-stub', status: 'completed', output: [fetched, message] }
		})
	);
	response.end('data: [DONE]\n\n');
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

/**
 * OpenRouter's model list, for the admin screen's search: a couple of
 * made-up models, so a spec can find one by name without the real list.
 */
const MODELS = {
	data: [
		{
			id: 'stubvendor/stub-storyteller-70b',
			name: 'Stub: Storyteller 70B',
			description: 'A stand-in storyteller for the suite.',
			context_length: 131_072,
			pricing: { prompt: '0.0000007', completion: '0.0000008' }
		},
		// Long enough to have to wrap in the picker on a phone.
		{
			id: 'stubvendor/a-model-with-an-identifier-long-enough-to-wrap-rather-than-scroll-sideways-instruct',
			name: 'Stub: A Model With A Name Long Enough That It Has To Wrap Onto A Second Line',
			context_length: 32_768,
			pricing: { prompt: '0.0000001', completion: '0.0000002' }
		},
		{
			id: 'stubvendor/other-model',
			name: 'Stub: Other',
			context_length: 8192,
			pricing: { prompt: '0.000001', completion: '0.000002' }
		}
	]
};

/**
 * Runware's `modelSearch`: one made-up Pony checkpoint, whatever was searched
 * for — except an AIR, which finds only itself, as Runware's own does.
 */
function modelSearch(task) {
	const asksForAir = /^[a-z0-9_-]+:[a-z0-9_-]+@[a-z0-9_.-]+$/i.test(task.search ?? '');
	const found = !asksForAir || task.search === 'civitai:111111@222222';
	return {
		data: [
			{
				taskType: 'modelSearch',
				taskUUID: task.taskUUID,
				results: found
					? [
							{
								air: 'civitai:111111@222222',
								name: 'Stub Pony Checkpoint',
								version: 'v1.0',
								architecture: 'pony',
								category: 'checkpoint',
								shortDescription: '<p>A <b>stub</b> checkpoint for the suite.</p>',
								tags: ['pony', 'stub'],
								defaultSteps: 30,
								defaultCFG: 6,
								positiveTriggerWords: 'score_9'
							}
						]
					: []
			}
		]
	};
}

/** Runware's `imageInference`, answered with `PICTURE` whatever was asked, and its `modelSearch`. */
async function picture(request, response) {
	if (request.headers.authorization !== `Bearer ${RUNWARE_KEY}`) {
		response.writeHead(401, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ errors: [{ code: 'missingApiKey' }] }));
		return;
	}
	let raw = '';
	for await (const piece of request) {
		raw += piece;
	}
	const [task] = JSON.parse(raw);
	response.writeHead(200, { 'content-type': 'application/json' });
	if (task.taskType === 'modelSearch') {
		response.end(JSON.stringify(modelSearch(task)));
		return;
	}
	response.end(
		JSON.stringify({
			data: [{ taskType: 'imageInference', taskUUID: task.taskUUID, imageBase64Data: PICTURE }]
		})
	);
}

/**
 * A stand-in for Resend's `POST /emails`, for a Workers run (`E2E_WORKER`),
 * whose only way to send mail is Resend; the app reaches it through
 * `RESEND_BASE_URL`. Each message is written to the run's mail folder in the
 * outbox's own format (`writeToOutbox`), so `e2e/mail.ts` reads it exactly as
 * it reads a `vite dev` run's, and answers as Resend does: an id, or a 401
 * naming the error for a wrong key.
 */
async function email(request, response) {
	if (request.headers.authorization !== `Bearer ${E2E_RESEND_KEY}`) {
		response.writeHead(401, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ statusCode: 401, name: 'invalid_api_key' }));
		return;
	}
	const parts = [];
	for await (const part of request) {
		parts.push(part);
	}
	const { from, to, subject, text, html } = JSON.parse(Buffer.concat(parts).toString('utf8'));
	const dir = join(E2E_RUN_DIR ?? '.', 'mail');
	await mkdir(dir, { recursive: true });
	const sentAt = new Date().toISOString();
	for (const address of to) {
		await writeFile(
			join(dir, `${Date.now()}-${randomUUID()}.json`),
			JSON.stringify({ from, sentAt, to: address, subject, text, html }, null, '\t')
		);
	}
	response.writeHead(200, { 'content-type': 'application/json' });
	response.end(JSON.stringify({ id: randomUUID() }));
}

const server = createServer(async (request, response) => {
	if (request.method === 'POST' && request.url === '/resend/emails') {
		await email(request, response);
		return;
	}
	if (request.method === 'POST' && request.url === '/runware') {
		await picture(request, response);
		return;
	}
	if (request.method === 'GET' && request.url === '/v1/models') {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(MODELS));
		return;
	}
	const responses = request.method === 'POST' && request.url === '/v1/responses';
	if (!responses && (request.method !== 'POST' || request.url !== '/v1/chat/completions')) {
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
	if (responses) {
		await streamResponses(body, response);
		return;
	}
	const last = lastUserMessage(body.messages);
	if (last.includes('[fail]') && !failed.has(last)) {
		failed.add(last);
		response.writeHead(500, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ error: { message: 'stub failure' } }));
		return;
	}

	if (body.response_format && !body.stream) {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(suggestionFor(body.messages)));
		return;
	}
	if (body.response_format) {
		await streamSuggestion(body, response);
		return;
	}

	response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
	response.write(': OPENROUTER PROCESSING\n\n');
	const event = (fields) =>
		`data: ${JSON.stringify({ id: 'gen-stub', model: body.model, provider: 'Stub', ...fields })}\n\n`;
	response.write(event({ choices: [{ delta: { reasoning: 'The stub thinks it over.' } }] }));
	for (const piece of chunks(replyFor(body.messages))) {
		if (response.destroyed) {
			return;
		}
		response.write(event({ choices: [{ delta: { content: piece } }] }));
		await sleep(20);
	}
	response.write(event({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
	if (body.usage?.include) {
		response.write(
			event({
				choices: [],
				usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
			})
		);
	}
	response.end('data: [DONE]\n\n');
});

server.listen(Number(E2E_MODEL_PORT), E2E_MODEL_HOST);
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => server.close(() => process.exit(0)));
}
