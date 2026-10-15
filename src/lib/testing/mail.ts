import type { Mailer, MailMessage } from '../server/mail';

/**
 * A mailer that keeps what it is given, for route tests.
 *
 * `sent` fills as soon as `send` is called. Routes hand mail to
 * `sendInBackground`, which calls `send` synchronously and only lets the
 * promise run on, so a test can read `sent` straight after the action returns.
 */
export function capturingMailer(): { mailer: Mailer; sent: MailMessage[] } {
	const sent: MailMessage[] = [];
	return {
		sent,
		mailer: {
			send(message) {
				sent.push(message);
				return Promise.resolve();
			}
		}
	};
}

/**
 * The first link in a message's text body, which is where every template puts
 * its one action. The e2e suite's `linkIn` uses this too, so the two cannot
 * disagree about where a link is.
 */
export function linkIn(message: Pick<MailMessage, 'subject' | 'text'>): URL {
	const match: RegExpExecArray | null = /https?:\/\/\S+/.exec(message.text);
	if (!match) {
		throw new Error(`No link in the "${message.subject}" email`);
	}
	return new URL(match[0]);
}
