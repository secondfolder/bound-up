import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Transporter } from 'nodemailer';
import type { MailMessage } from './index';

/**
 * The mail transports that need Node: SMTP and the outbox. Imported only from
 * behind `dev || __SELF_HOSTED__` in `./index`, so none of this reaches the
 * worker bundle.
 */

const transporters = new Map<string, Transporter>();

/**
 * Sends over SMTP. One transporter per URL for the life of the process, which
 * is safe for the same reason `localDb` is: the Node builds are one process.
 */
export async function sendSmtp(url: string, from: string, message: MailMessage): Promise<void> {
	let transporter = transporters.get(url);
	if (!transporter) {
		const { createTransport } = await import('nodemailer');
		transporter = createTransport(url);
		transporters.set(url, transporter);
	}
	await transporter.sendMail({ from, ...message });
}

/**
 * Writes the message to `<dir>/<time>-<random>.json` instead of sending it.
 *
 * For `npm run dev`, where nobody wants a real provider just to click a sign-up
 * link, and for the Playwright suite, which reads the link back out (see
 * `e2e/mail.ts`). The file name sorts by time, so the newest is last.
 */
export async function writeToOutbox(
	dir: string,
	from: string,
	message: MailMessage
): Promise<void> {
	await mkdir(dir, { recursive: true });
	const name = `${Date.now()}-${crypto.randomUUID()}.json`;
	const sentAt = new Date().toISOString();
	await writeFile(join(dir, name), JSON.stringify({ from, sentAt, ...message }, null, '\t'));
}
