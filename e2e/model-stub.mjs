// A stand-in for OpenRouter, for the Playwright suite. Started by
// `e2e/server.mjs` beside the app, which is pointed at it through
// `OPENROUTER_BASE_URL`, so a Daydreams spec never calls (or pays) a real
// model and its replies are predictable.
//
// It speaks just enough of the OpenAI-compatible streaming API the reply
// endpoint relays: `POST /v1/chat/completions` answered with `data:` events,
// a keep-alive comment like OpenRouter sends, and `data: [DONE]`.
//
// What it writes:
// - the opening, when the only user message is the server's request to begin;
// - otherwise `<character> heard: "<the user's last turn>"`, with a take
//   number when the same conversation is answered again (a retried reply).
//   Counted per whole conversation, because the specs run in parallel against
//   one stub and every one of them opens the same way;
// - a 500, once, for a turn containing `[fail]`, so a spec can see a failure
//   and then "Try again" succeed.
import { createServer } from 'node:http';

const { E2E_MODEL_PORT, E2E_MODEL_HOST = '127.0.0.1' } = process.env;
if (!E2E_MODEL_PORT) {
	console.error('e2e/model-stub.mjs is started by e2e/server.mjs, which sets its environment.');
	process.exit(2);
}

/** The key the app is given in the suite's environment (playwright.config.ts). */
const KEY = 'e2e-openrouter-key';
/** How the server's prompt names the character (`describeSetup`). */
const CHARACTER_LINE = 'Your character: ';

/** How many times each conversation has been answered, for the take number. */
const takes = new Map();
/** Turns that have already failed once. */
const failed = new Set();

function replyFor(messages) {
	const system = messages.find((message) => message.role === 'system')?.content ?? '';
	// A line search rather than `exec`, whose null Biome does not believe in
	// (see AGENTS.md) and a plain .mjs has no annotation to argue with.
	const line = system.split('\n').find((candidate) => candidate.startsWith(CHARACTER_LINE));
	const name = line ? line.slice(CHARACTER_LINE.length) : 'The character';
	const users = messages.filter((message) => message.role === 'user');
	const last = users.at(-1)?.content ?? '';
	if (users.length === 1 && last.startsWith('Begin the scene')) {
		return `${name} looks up as you come in.\n\nThe door clicks shut behind you.`;
	}
	const conversation = JSON.stringify(messages);
	const take = (takes.get(conversation) ?? 0) + 1;
	takes.set(conversation, take);
	return `${name} heard: "${last}"${take > 1 ? ` (take ${take})` : ''}`;
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
