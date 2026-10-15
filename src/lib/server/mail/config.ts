import { dev } from '$app/environment';
import { env as privateEnv } from '$env/dynamic/private';

/**
 * Where this server's email goes, read from its environment. See docs/email.md.
 *
 * Required, unlike push (`readVapidConfig`): signing in needs a verified
 * address, and a server that cannot send the link has accounts nobody can
 * finish creating. So a missing mailer is a startup failure with the fix in the
 * message, the same as a missing `BETTER_AUTH_SECRET`.
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
	/** Writes each message to a JSON file instead of sending it. Dev and tests only. */
	| { kind: 'outbox'; dir: string };

export type MailEnv = {
	MAIL_FROM?: string | undefined;
	RESEND_API_KEY?: string | undefined;
	SMTP_URL?: string | undefined;
	MAIL_OUTBOX_DIR?: string | undefined;
};

const SMTP_URL_SCHEME: RegExp = /^smtps?:\/\//;

const HOW_TO_FIX =
	'In development `npm run secrets -- dev` fills in a local outbox; on Workers set ' +
	'MAIL_FROM and RESEND_API_KEY with `npm run secrets -- production` (or ' +
	'`-- remote-preview`); self-hosted, set MAIL_FROM and either RESEND_API_KEY or ' +
	'SMTP_URL in the .env beside docker-compose.yml. See docs/email.md.';

/**
 * Turns the environment into a config, or throws saying what is missing.
 *
 * `nodeTarget` is whether this build can open sockets and files: `vite dev` and
 * the Docker image can, Workers cannot. SMTP and the outbox both need that, so
 * on Workers they are refused here rather than failing on the first send.
 */
export function parseMailConfig(values: MailEnv, nodeTarget: boolean): MailConfig {
	const from = values.MAIL_FROM?.trim();
	if (!from) {
		throw new Error(`MAIL_FROM is not set, so this server cannot send email. ${HOW_TO_FIX}`);
	}

	const set = (
		[
			['RESEND_API_KEY', values.RESEND_API_KEY],
			['SMTP_URL', values.SMTP_URL],
			['MAIL_OUTBOX_DIR', values.MAIL_OUTBOX_DIR]
		] as const
	).filter(([, given]) => given?.trim());
	if (set.length !== 1) {
		const which =
			set.length === 0 ? 'none of' : `more than one of (${set.map(([key]) => key).join(', ')})`;
		throw new Error(
			`Set exactly one of RESEND_API_KEY, SMTP_URL or MAIL_OUTBOX_DIR; ${which} them is set. ${HOW_TO_FIX}`
		);
	}
	const [[name, raw = '']] = set as [readonly [string, string]];
	const value = raw.trim();

	if (name === 'RESEND_API_KEY') {
		return { from, transport: { kind: 'resend', apiKey: value } };
	}
	if (!nodeTarget) {
		throw new Error(
			`${name} only works on the Node builds (vite dev and the Docker image); on Workers use RESEND_API_KEY. ${HOW_TO_FIX}`
		);
	}
	if (name === 'SMTP_URL') {
		if (!SMTP_URL_SCHEME.test(value)) {
			throw new Error(`SMTP_URL must start with smtp:// or smtps://. ${HOW_TO_FIX}`);
		}
		return { from, transport: { kind: 'smtp', url: value } };
	}
	return { from, transport: { kind: 'outbox', dir: value } };
}

/**
 * This request's mail config: `platform.env` on Workers, the process
 * environment everywhere else, like every other secret here.
 */
export function readMailConfig(platform: App.Platform | undefined): MailConfig {
	const read = (name: keyof MailEnv) => platform?.env?.[name] ?? privateEnv[name];
	return parseMailConfig(
		{
			MAIL_FROM: read('MAIL_FROM'),
			RESEND_API_KEY: read('RESEND_API_KEY'),
			SMTP_URL: read('SMTP_URL'),
			MAIL_OUTBOX_DIR: read('MAIL_OUTBOX_DIR')
		},
		dev || __SELF_HOSTED__
	);
}
