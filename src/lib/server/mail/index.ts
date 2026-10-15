import { dev } from '$app/environment';
import { inBackground } from '../background';
import type { MailConfig } from './config';

/** One email, ready to go. Both bodies, so every client has something it can show. */
export type MailMessage = {
	to: string;
	subject: string;
	text: string;
	html: string;
};

export type Mailer = {
	/** Rejects when the message could not be handed over. Never logs the address. */
	send: (message: MailMessage) => Promise<void>;
};

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Builds the mailer a config describes. See docs/email.md.
 *
 * `fetchImpl` is a parameter so the tests can stand in for Resend, as
 * `sendPush` does for push services.
 *
 * SMTP and the outbox live in `./local`, reached only behind
 * `dev || __SELF_HOSTED__`. Both are build-time constants, so nodemailer and
 * `node:fs` are dead code in the worker bundle, where neither could load —
 * the same arrangement as `db/backend.ts`.
 */
export function createMailer(config: MailConfig, fetchImpl: typeof fetch = fetch): Mailer {
	const { transport } = config;
	if (transport.kind === 'resend') {
		return {
			async send(message) {
				const response = await fetchImpl(RESEND_ENDPOINT, {
					method: 'POST',
					headers: {
						authorization: `Bearer ${transport.apiKey}`,
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						from: config.from,
						to: [message.to],
						subject: message.subject,
						text: message.text,
						html: message.html
					})
				});
				if (!response.ok) {
					// Only the error's `name` (`validation_error`, `invalid_api_key`…)
					// goes into the log, never its `message`: a validation error can
					// quote the `to` field back, and no address may reach a log.
					throw new Error(
						`Resend refused the message (${response.status}): ${await resendErrorName(response)}`
					);
				}
			}
		};
	}
	if (dev || __SELF_HOSTED__) {
		return {
			async send(message) {
				const local = await import('./local');
				await (transport.kind === 'smtp'
					? local.sendSmtp(transport.url, config.from, message)
					: local.writeToOutbox(transport.dir, config.from, message));
			}
		};
	}
	// Unreachable: `parseMailConfig` refuses SMTP and the outbox on Workers.
	throw new Error(`The ${transport.kind} mail transport is not available on this build`);
}

// An error code and nothing else, so a body that is not Resend's cannot put
// arbitrary text — an address, say — into the log through it.
const RESEND_ERROR_NAME = /^[a-z_]{1,64}$/;

/** The machine-readable half of a Resend error, or `unknown` if the body has none. */
async function resendErrorName(response: Response): Promise<string> {
	const body: unknown = await response.json().catch(() => null);
	const name = typeof body === 'object' && body !== null && 'name' in body ? body.name : null;
	return typeof name === 'string' && RESEND_ERROR_NAME.test(name) ? name : 'unknown';
}

/**
 * Sends without making the response wait, and without letting a failure
 * escape.
 *
 * Not waiting matters twice over: a slow provider would hold up sign-up, and
 * how long a response took would say whether an email was sent — which, for
 * the resend and recovery forms, is whether an account exists. A failure is
 * logged by `what` alone, never with the address, and the person can ask for
 * another link.
 *
 * `onlyIf` is a condition checked in the background before sending — the
 * per-address limit, for the emails a stranger could ask for.
 */
export function sendInBackground(
	platform: App.Platform | undefined,
	mailer: Mailer,
	message: MailMessage,
	what: string,
	onlyIf?: () => Promise<boolean>
): void {
	const send = async () => {
		// Decided here rather than by the caller, so that a limit refusing the
		// message costs the response no more time than sending it would.
		if (onlyIf && !(await onlyIf())) {
			return;
		}
		await mailer.send(message);
	};
	inBackground(
		platform,
		send().catch((error: unknown) => {
			console.error(`mail: could not send the ${what} email`, error);
		})
	);
}
