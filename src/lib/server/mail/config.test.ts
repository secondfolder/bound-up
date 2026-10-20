import { describe, expect, it } from 'vitest';
import { testSettings } from '$lib/testing/settings';
import { DEV_MAIL_FROM, DEV_OUTBOX_DIR, MailNotSetUpError, parseMailConfig } from './config';

describe('parseMailConfig', () => {
	const from = 'Bound Up <hello@example.test>';
	const mail = (values: Parameters<typeof testSettings>[0]) =>
		testSettings({ mailFrom: from, ...values });

	it('takes a Resend key on any target', () => {
		for (const nodeTarget of [true, false]) {
			expect(
				parseMailConfig(mail({ mailTransport: 'resend', resendApiKey: 're_123' }), nodeTarget)
			).toEqual({ from, transport: { kind: 'resend', apiKey: 're_123' } });
		}
	});

	it('takes an SMTP URL or an outbox on a Node target', () => {
		expect(
			parseMailConfig(
				mail({ mailTransport: 'smtp', smtpUrl: 'smtps://u:p@mail.example.test' }),
				true
			).transport
		).toEqual({ kind: 'smtp', url: 'smtps://u:p@mail.example.test' });
		expect(
			parseMailConfig(mail({ mailTransport: 'outbox', mailOutboxDir: './.mail-outbox' }), true)
				.transport
		).toEqual({ kind: 'outbox', dir: './.mail-outbox' });
	});

	it('uses only the chosen transport, whatever else is stored', () => {
		expect(
			parseMailConfig(
				mail({ mailTransport: 'resend', resendApiKey: 're_1', smtpUrl: 'smtp://x' }),
				true
			).transport
		).toEqual({ kind: 'resend', apiKey: 're_1' });
	});

	it('refuses SMTP and the outbox on Workers, naming Resend', () => {
		expect(() =>
			parseMailConfig(mail({ mailTransport: 'smtp', smtpUrl: 'smtp://mail.example.test' }), false)
		).toThrow(/only works on the Node builds.*use Resend/);
		expect(() =>
			parseMailConfig(mail({ mailTransport: 'outbox', mailOutboxDir: '/tmp/x' }), false)
		).toThrow(MailNotSetUpError);
	});

	it('says what is missing and where to set it', () => {
		expect(() => parseMailConfig(testSettings({ mailTransport: 'resend' }), true)).toThrow(
			/No sender address.*Admin → Server settings/
		);
		expect(() => parseMailConfig(mail({}), true)).toThrow(/No way to send email is chosen/);
		expect(() => parseMailConfig(mail({ mailTransport: 'resend' }), true)).toThrow(/no API key/);
		expect(() => parseMailConfig(mail({ mailTransport: 'outbox' }), true)).toThrow(/no folder/);
		expect(() =>
			parseMailConfig(mail({ mailTransport: 'smtp', smtpUrl: 'mail.example.test:587' }), true)
		).toThrow(/smtp:\/\/ or smtps:\/\//);
	});

	it('falls back to the local outbox under vite dev, and only there', () => {
		expect(parseMailConfig(testSettings(), true, true)).toEqual({
			from: DEV_MAIL_FROM,
			transport: { kind: 'outbox', dir: DEV_OUTBOX_DIR }
		});
		expect(parseMailConfig(mail({}), true, true).from).toBe(from);
		expect(() => parseMailConfig(testSettings(), true, false)).toThrow(MailNotSetUpError);
	});
});
