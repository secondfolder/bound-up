import { describe, expect, it } from 'vitest';
import { parseMailConfig } from './config';

describe('parseMailConfig', () => {
	const from = 'Bound Up <hello@example.test>';

	it('takes a Resend key on any target', () => {
		for (const nodeTarget of [true, false]) {
			expect(parseMailConfig({ MAIL_FROM: from, RESEND_API_KEY: 're_123' }, nodeTarget)).toEqual({
				from,
				transport: { kind: 'resend', apiKey: 're_123' }
			});
		}
	});

	it('takes SMTP and the outbox on the Node targets', () => {
		expect(
			parseMailConfig({ MAIL_FROM: from, SMTP_URL: 'smtps://u:p@mail.example.test' }, true)
		).toEqual({
			from,
			transport: { kind: 'smtp', url: 'smtps://u:p@mail.example.test' }
		});
		expect(parseMailConfig({ MAIL_FROM: from, MAIL_OUTBOX_DIR: './.mail-outbox' }, true)).toEqual({
			from,
			transport: { kind: 'outbox', dir: './.mail-outbox' }
		});
	});

	// Workers can open neither a socket to an SMTP server nor a file.
	it('refuses SMTP and the outbox on Workers, naming the alternative', () => {
		expect(() =>
			parseMailConfig({ MAIL_FROM: from, SMTP_URL: 'smtp://mail.example.test' }, false)
		).toThrow(/only works on the Node builds.*RESEND_API_KEY/);
		expect(() => parseMailConfig({ MAIL_FROM: from, MAIL_OUTBOX_DIR: '/tmp/x' }, false)).toThrow(
			/only works on the Node builds/
		);
	});

	it('requires MAIL_FROM, and says how to set it', () => {
		expect(() => parseMailConfig({ RESEND_API_KEY: 're_123' }, true)).toThrow(
			/MAIL_FROM is not set.*npm run secrets/
		);
		expect(() => parseMailConfig({ MAIL_FROM: '  ', RESEND_API_KEY: 're_123' }, true)).toThrow(
			/MAIL_FROM/
		);
	});

	it('requires exactly one transport', () => {
		expect(() => parseMailConfig({ MAIL_FROM: from }, true)).toThrow(/none of them is set/);
		expect(() =>
			parseMailConfig({ MAIL_FROM: from, RESEND_API_KEY: 're_123', SMTP_URL: 'smtp://x' }, true)
		).toThrow(/more than one of \(RESEND_API_KEY, SMTP_URL\)/);
		// An empty value is not set, as docker-compose's `${X:-}` leaves it.
		expect(
			parseMailConfig({ MAIL_FROM: from, RESEND_API_KEY: 're_123', SMTP_URL: '' }, true).transport
				.kind
		).toBe('resend');
	});

	it('refuses an SMTP URL that is not one', () => {
		expect(() =>
			parseMailConfig({ MAIL_FROM: from, SMTP_URL: 'mail.example.test:587' }, true)
		).toThrow(/smtp:\/\/ or smtps:\/\//);
	});
});
