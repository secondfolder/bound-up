import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@playwright/test';
import { linkIn as firstLinkIn } from '../src/lib/testing/mail';
import { E2E_CONTAINER, E2E_CONTAINER_MAIL_DIR, E2E_MAIL_DIR } from './run-paths';

/**
 * The email the server would have sent, read back out of its outbox.
 *
 * The suite's server runs with `MAIL_OUTBOX_DIR` (playwright.config.ts), so
 * every message is a JSON file rather than a real email — see `writeToOutbox`
 * in `src/lib/server/mail/local.ts`. Against `vite dev` that directory is in
 * the run directory and read from here; against a Docker image it is inside the
 * container and read through `docker exec`, for the same reason `e2e/db.ts`
 * does that with the database.
 */

export type Mail = { to: string; subject: string; text: string; html: string; sentAt: string };

const run = promisify(execFile);

// Reads every message in the directory and prints them as one JSON array, in
// file-name order, which is the order they were written.
const IN_CONTAINER = `
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const dir = process.argv[1];
const names = await readdir(dir).catch(() => []);
const mails = [];
for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
	mails.push(JSON.parse(await readFile(join(dir, name), 'utf8')));
}
process.stdout.write(JSON.stringify(mails));
`;

async function readOutbox(): Promise<Mail[]> {
	if (process.env.E2E_IMAGE) {
		const { stdout } = await run('docker', [
			'exec',
			E2E_CONTAINER,
			'node',
			'--input-type=module',
			'-e',
			IN_CONTAINER,
			E2E_CONTAINER_MAIL_DIR
		]);
		return JSON.parse(stdout) as Mail[];
	}
	const names = await readdir(E2E_MAIL_DIR).catch(() => [] as string[]);
	const mails: Mail[] = [];
	for (const name of names.filter((file) => file.endsWith('.json')).sort()) {
		mails.push(JSON.parse(await readFile(join(E2E_MAIL_DIR, name), 'utf8')) as Mail);
	}
	return mails;
}

/** Every message sent to one address so far, oldest first. */
export async function mailsTo(address: string): Promise<Mail[]> {
	const wanted = address.toLowerCase();
	return (await readOutbox()).filter((mail) => mail.to.toLowerCase() === wanted);
}

/**
 * Waits until `address` has been sent at least `count` messages, and returns
 * the newest. Polled rather than read once: the server sends in the
 * background, after its response, so the file can land a moment after the
 * page has moved on.
 *
 * To wait for one more than there were, read `(await mailsTo(x)).length`
 * before the step that sends, and pass that plus one.
 */
export async function waitForMailTo(address: string, count = 1): Promise<Mail> {
	let latest: Mail | undefined;
	await expect
		.poll(
			async () => {
				const mails = await mailsTo(address);
				latest = mails.at(-1);
				return mails.length;
			},
			{ message: `waiting for email number ${count} to ${address}`, timeout: 15_000 }
		)
		.toBeGreaterThanOrEqual(count);
	if (!latest) {
		throw new Error(`No email to ${address}`);
	}
	return latest;
}

/** The one link a message carries, from its text body — every template has exactly one. */
export function linkIn(mail: Mail): string {
	return firstLinkIn(mail).href;
}
