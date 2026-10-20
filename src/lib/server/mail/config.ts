import { dev } from '$app/environment';
import { isMailTransport, type ServerSettings } from '$lib/server-settings';

/**
 * Where this server's email goes, from its settings (Admin → Server settings).
 * See docs/email.md.
 *
 * Needed, unlike push (`readVapidConfig`): signing in needs a verified
 * address, and a server that cannot send the link has accounts nobody can
 * finish creating. But it is not a startup failure any more, because it is set
 * from inside the app: a server without it starts, its admin page says email
 * is not set up, and the very first account is let in without a link so that
 * someone can get to that page (see the sign-up action).
 */
export type MailConfig = {
	/** The `From:` header, as given: `Bound Up <hello@example.com>` or a bare address. */
	from: string;
	transport: MailTransportConfig;
};

export type MailTransportConfig =
	/** Resend's HTTP API: one `fetch`, so it works on Workers as well as Node. */
	| { kind: 'resend'; apiKey: string }
	/** Any SMTP server, as a `smtp://` or `smtps://` URL. Node targets only. */
	| { kind: 'smtp'; url: string }
	/** Writes each message to a JSON file instead of sending it. Node targets only. */
	| { kind: 'outbox'; dir: string };

export type MailSettings = Pick<
	ServerSettings,
	'mailFrom' | 'mailTransport' | 'resendApiKey' | 'smtpUrl' | 'mailOutboxDir'
>;

export const SMTP_URL_SCHEME: RegExp = /^smtps?:\/\//;

/**
 * Under `vite dev` with nothing set, mail goes to files here, so nobody needs
 * a provider to click their own sign-up link. Gitignored.
 */
export const DEV_OUTBOX_DIR = './.mail-outbox';
export const DEV_MAIL_FROM = 'Bound Up <dev@localhost>';

const HOW_TO_FIX = 'Set it up in Settings → Admin → Server settings. See docs/email.md.';

/** Why this server cannot send email, said to whoever runs it. */
export class MailNotSetUpError extends Error {}

/**
 * Turns the settings into a config, or throws `MailNotSetUpError` saying what
 * is missing.
 *
 * `nodeTarget` is whether this build can open sockets and files: `vite dev`
 * and the Docker image can, Workers cannot. SMTP and the outbox both need
 * that, so on Workers they are refused here rather than failing on the first
 * send. `devDefaults` fills an unset sender and transport with the local
 * outbox above.
 */
export function parseMailConfig(
	values: MailSettings,
	nodeTarget: boolean,
	devDefaults = false
): MailConfig {
	const from = values.mailFrom.trim() || (devDefaults ? DEV_MAIL_FROM : '');
	if (!from) {
		throw new MailNotSetUpError(
			`No sender address is set, so this server cannot send email. ${HOW_TO_FIX}`
		);
	}
	const kind = values.mailTransport.trim();
	if (kind === '' && devDefaults) {
		return { from, transport: { kind: 'outbox', dir: DEV_OUTBOX_DIR } };
	}
	if (!isMailTransport(kind)) {
		throw new MailNotSetUpError(`No way to send email is chosen. ${HOW_TO_FIX}`);
	}
	if (kind === 'resend') {
		const apiKey = values.resendApiKey.trim();
		if (!apiKey) {
			throw new MailNotSetUpError(
				`Email is to go through Resend, but no API key is set. ${HOW_TO_FIX}`
			);
		}
		return { from, transport: { kind, apiKey } };
	}
	if (!nodeTarget) {
		throw new MailNotSetUpError(
			`Sending through ${kind === 'smtp' ? 'SMTP' : 'files'} only works on the Node builds (vite dev and the Docker image); on Workers use Resend. ${HOW_TO_FIX}`
		);
	}
	if (kind === 'smtp') {
		const url = values.smtpUrl.trim();
		if (!SMTP_URL_SCHEME.test(url)) {
			throw new MailNotSetUpError(
				`The SMTP server must be a URL starting smtp:// or smtps://. ${HOW_TO_FIX}`
			);
		}
		return { from, transport: { kind, url } };
	}
	const dir = values.mailOutboxDir.trim();
	if (!dir) {
		throw new MailNotSetUpError(
			`Email is to be written to files, but no folder is set. ${HOW_TO_FIX}`
		);
	}
	return { from, transport: { kind, dir } };
}

/** Whether SMTP and the outbox can work on this build. */
export const MAIL_NODE_TARGET: boolean = dev || __SELF_HOSTED__;

/** This server's mail config, from its settings; throws `MailNotSetUpError` when there is none. */
export function readMailConfig(settings: MailSettings): MailConfig {
	return parseMailConfig(settings, MAIL_NODE_TARGET, dev);
}

/** Why mail cannot be sent, or null when it can. For the admin screen and the sign-up bootstrap. */
export function mailProblem(settings: MailSettings): string | null {
	try {
		readMailConfig(settings);
		return null;
	} catch (error) {
		if (error instanceof MailNotSetUpError) {
			return error.message;
		}
		throw error;
	}
}
