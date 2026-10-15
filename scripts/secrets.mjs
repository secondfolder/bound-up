#!/usr/bin/env node
/**
 * Generates the secrets the app needs and stores them where one environment
 * reads them. One script for every environment, so they cannot drift apart.
 *
 *   npm run secrets -- dev                 .env           (`npm run dev`)
 *   npm run secrets -- local-preview       .dev.vars      (`npm run preview`)
 *   npm run secrets -- production          wrangler secret bulk
 *   npm run secrets -- remote-preview      wrangler preview base-config secret bulk
 *   npm run secrets -- print               stdout, e.g. for a self-hosted .env
 *
 * Options:
 *   --subject <mailto:…|https:…>   VAPID_SUBJECT, if it is not set already
 *   --mail-from <"Name <a@b>">     MAIL_FROM, if it is not set already
 *   --resend-key <re_…>            RESEND_API_KEY, if no mail transport is set
 *   --rotate <BETTER_AUTH_SECRET|VAPID>   regenerate one even though it is set
 *   --dry-run                      say what would be set, and set nothing
 *
 * Email (docs/email.md) is required, and its credentials cannot be generated:
 * `dev` points it at a local outbox directory instead, and the Workers targets
 * ask for a Resend key and sender (or take them from the options above).
 * `print` leaves them to the self-hoster, who may prefer SMTP.
 *
 * **Only what is missing is generated.** A secret that is already set is left
 * alone unless `--rotate` names it, because replacing one is never harmless:
 * a new BETTER_AUTH_SECRET signs every account out, and a new VAPID pair stops
 * notifications on every subscribed device until each turns them on again.
 * The two VAPID keys are generated together or not at all.
 *
 * Remote targets learn what exists from `wrangler … secret list`, which gives
 * names only, never values. A value is never printed except by `print`.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

const TARGETS = {
	dev: { file: '.env', example: '.env.example' },
	'local-preview': { file: '.dev.vars', example: '.dev.vars.example' },
	production: {
		list: ['secret', 'list', '--format', 'json'],
		bulk: ['secret', 'bulk']
	},
	'remote-preview': {
		list: ['preview', 'base-config', 'secret', 'list', '--json'],
		bulk: ['preview', 'base-config', 'secret', 'bulk']
	},
	print: {}
};

/** Every secret this script owns. Anything else in a file is not its business. */
const MANAGED = [
	'BETTER_AUTH_SECRET',
	'VAPID_PUBLIC_KEY',
	'VAPID_PRIVATE_KEY',
	'VAPID_SUBJECT',
	'MAIL_FROM',
	'RESEND_API_KEY',
	'MAIL_OUTBOX_DIR'
];

/** Any one of these is a mail transport; the app refuses more than one. */
const MAIL_TRANSPORTS = ['RESEND_API_KEY', 'SMTP_URL', 'MAIL_OUTBOX_DIR'];

/**
 * `npm run dev` writes email to files here rather than sending it, so nobody
 * needs a provider to click their own sign-up link. Gitignored.
 */
const LOCAL_OUTBOX = './.mail-outbox';
const LOCAL_MAIL_FROM = 'Bound Up <dev@localhost>';

/** Local targets push to real push services too, so a placeholder subject is fine there. */
const LOCAL_SUBJECT = 'mailto:dev@example.com';

const say = (line = '') => process.stderr.write(`${line}\n`);

function fail(message) {
	say(`error: ${message}`);
	process.exit(1);
}

const { values: options, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		subject: { type: 'string' },
		'mail-from': { type: 'string' },
		'resend-key': { type: 'string' },
		rotate: { type: 'string', multiple: true, default: [] },
		'dry-run': { type: 'boolean', default: false },
		help: { type: 'boolean', short: 'h', default: false }
	}
});

const [targetName] = positionals;
if (options.help || !targetName || !Object.hasOwn(TARGETS, targetName)) {
	say('usage: npm run secrets -- <dev|local-preview|production|remote-preview|print>');
	say('       [--subject mailto:you@example.com] [--mail-from "Bound Up <hi@example.com>"]');
	say('       [--resend-key re_…] [--rotate BETTER_AUTH_SECRET|VAPID] [--dry-run]');
	process.exit(options.help ? 0 : 1);
}
const target = TARGETS[targetName];
for (const name of options.rotate) {
	if (name !== 'BETTER_AUTH_SECRET' && name !== 'VAPID') {
		fail(`--rotate takes BETTER_AUTH_SECRET or VAPID, not ${name}`);
	}
}

// ── what is set already ──────────────────────────────────────────────────────

const ENV_LINE = /^\s*(?<name>[A-Z0-9_]+)\s*=\s*(?<value>.*?)\s*$/;
const QUOTED = /^(?<quote>["'])(?<inner>.*)\k<quote>$/;
const SUBJECT = /^(?:mailto:|https:)/;

/** `KEY=value` lines, with optional quotes. An empty value counts as unset. */
function readEnvFile(path) {
	const values = new Map();
	if (!existsSync(path)) {
		return values;
	}
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const groups = line.match(ENV_LINE)?.groups;
		if (groups) {
			const value = groups.value.replace(QUOTED, '$<inner>');
			if (value !== '') {
				values.set(groups.name, value);
			}
		}
	}
	return values;
}

/** Runs wrangler. Captures stdout only when asked, so a login prompt still shows. */
function wrangler(args, { capture = false } = {}) {
	return execFileSync('npx', ['wrangler', ...args], {
		encoding: 'utf8',
		stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit']
	});
}

/** Names only: neither list command can return a value. */
function existingNames() {
	if (target.file) {
		return new Set(readEnvFile(target.file).keys());
	}
	if (target.list) {
		const output = wrangler(target.list, { capture: true });
		// Wrangler can print a banner before the JSON.
		const json = output.slice(output.indexOf('['));
		return new Set(JSON.parse(json).map((secret) => secret.name));
	}
	return new Set();
}

// ── generating ───────────────────────────────────────────────────────────────

async function vapidPair() {
	const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify'
	]);
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
	const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
	return { VAPID_PUBLIC_KEY: Buffer.from(raw).toString('base64url'), VAPID_PRIVATE_KEY: d };
}

/** Asks on the terminal, or fails naming the option that would have answered. */
async function ask(question, option) {
	if (!process.stdin.isTTY) {
		fail(`${question.split(' ')[0]} is not set. Pass ${option}`);
	}
	const prompt = createInterface({ input: process.stdin, output: process.stderr });
	const answer = (await prompt.question(`${question}: `)).trim();
	prompt.close();
	return answer;
}

async function vapidSubject() {
	if (options.subject) {
		return options.subject;
	}
	if (target.file) {
		return LOCAL_SUBJECT;
	}
	// Asked rather than guessed: it is sent to every push service, so it should
	// be an address someone actually reads.
	return await ask(
		'VAPID_SUBJECT (a mailto: or https: URL push services can contact)',
		'--subject mailto:you@example.com'
	);
}

const existing = existingNames();
const rotate = new Set(options.rotate);
const missing = (name) => !existing.has(name);
const generated = {};

if (missing('BETTER_AUTH_SECRET') || rotate.has('BETTER_AUTH_SECRET')) {
	generated.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
}

const hasPublic = existing.has('VAPID_PUBLIC_KEY');
const hasPrivate = existing.has('VAPID_PRIVATE_KEY');
if (hasPublic !== hasPrivate && !rotate.has('VAPID')) {
	fail(
		`only one of VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY is set for ${targetName}. ` +
			'They are a pair: pass --rotate VAPID to replace both.'
	);
}
if (!(hasPublic && hasPrivate) || rotate.has('VAPID')) {
	Object.assign(generated, await vapidPair());
}
if (missing('VAPID_SUBJECT') || (rotate.has('VAPID') && options.subject)) {
	const subject = await vapidSubject();
	if (!SUBJECT.test(subject)) {
		fail(`VAPID_SUBJECT must start with mailto: or https:, got "${subject}"`);
	}
	generated.VAPID_SUBJECT = subject;
}

// Email. Only `dev` can use the outbox: `local-preview` runs the real Workers
// runtime, which can write no files, so it needs Resend like production does.
// `print` is for a self-hoster, who chooses their own transport.
if ((targetName !== 'print' || options['mail-from']) && missing('MAIL_FROM')) {
	generated.MAIL_FROM =
		options['mail-from'] ??
		(targetName === 'dev'
			? LOCAL_MAIL_FROM
			: await ask(
					'MAIL_FROM (the sender, e.g. "Bound Up <hello@your-domain>", on a domain Resend has verified)',
					'--mail-from "Bound Up <hello@your-domain>"'
				));
}
if (MAIL_TRANSPORTS.every(missing)) {
	if (options['resend-key']) {
		generated.RESEND_API_KEY = options['resend-key'];
	} else if (targetName === 'dev') {
		generated.MAIL_OUTBOX_DIR = LOCAL_OUTBOX;
	} else if (targetName !== 'print') {
		generated.RESEND_API_KEY = await ask(
			'RESEND_API_KEY (from resend.com, allowed to send from MAIL_FROM)',
			'--resend-key re_…'
		);
	}
}
if (targetName === 'print' && !generated.MAIL_FROM) {
	say(
		'Also set MAIL_FROM and one of RESEND_API_KEY or SMTP_URL: the server will not start ' +
			'without email. See docs/self-hosting.md.'
	);
}

// ── storing ──────────────────────────────────────────────────────────────────

const names = Object.keys(generated);
if (targetName !== 'print') {
	const kept = MANAGED.filter((name) => existing.has(name) && !names.includes(name));
	if (kept.length > 0) {
		say(`Already set, left alone: ${kept.join(', ')}`);
	}
	if (names.length === 0) {
		say(`Nothing to do for ${targetName}.`);
		process.exit(0);
	}
	say(`${options['dry-run'] ? 'Would set' : 'Setting'} for ${targetName}: ${names.join(', ')}`);
	for (const name of rotate) {
		say(
			name === 'VAPID'
				? 'Rotating VAPID: every subscribed device stops getting notifications until it turns them on again.'
				: 'Rotating BETTER_AUTH_SECRET: every account is signed out.'
		);
	}
	if (options['dry-run']) {
		process.exit(0);
	}
}

if (targetName === 'print') {
	for (const [name, value] of Object.entries(generated)) {
		process.stdout.write(`${name}="${value}"\n`);
	}
} else if (target.file) {
	if (!existsSync(target.file)) {
		copyFileSync(target.example, target.file);
	}
	let text = readFileSync(target.file, 'utf8');
	for (const [name, value] of Object.entries(generated)) {
		const line = `${name}="${value}"`;
		const pattern = new RegExp(`^\\s*${name}\\s*=.*$`, 'm');
		text = pattern.test(text)
			? text.replace(pattern, line)
			: `${text}${text.endsWith('\n') ? '' : '\n'}${line}\n`;
	}
	writeFileSync(target.file, text);
	say(`Wrote ${target.file}.`);
} else {
	// A file rather than stdin, because only `secret bulk` documents reading
	// stdin. Owner-only, in a private directory, and removed whatever happens.
	const dir = mkdtempSync(join(tmpdir(), 'bound-up-secrets-'));
	const file = join(dir, 'secrets.json');
	try {
		writeFileSync(file, JSON.stringify(generated), { mode: 0o600 });
		wrangler([...target.bulk, file]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	say(`Set on ${targetName}.`);
}
