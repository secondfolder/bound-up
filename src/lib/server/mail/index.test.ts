import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailer, type MailMessage, resendBaseUrl, sendInBackground } from './index';

const message: MailMessage = {
	to: 'ada@example.test',
	subject: 'Confirm your email for Bound Up',
	text: 'Confirm: https://app.test/x',
	html: '<p>Confirm</p>'
};

describe('Resend', () => {
	it('posts the message with the key, from the configured sender', async () => {
		const fetchImpl = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
			Promise.resolve(new Response('{"id":"1"}', { status: 200 }))
		);
		const mailer = createMailer(
			{ from: 'Bound Up <hello@example.test>', transport: { kind: 'resend', apiKey: 're_123' } },
			fetchImpl as unknown as typeof fetch
		);
		await mailer.send(message);

		const [url, init] = fetchImpl.mock.calls[0] ?? [];
		expect(url).toBe('https://api.resend.com/emails');
		expect(init?.method).toBe('POST');
		expect(new Headers(init?.headers).get('authorization')).toBe('Bearer re_123');
		expect(JSON.parse(String(init?.body))).toEqual({
			from: 'Bound Up <hello@example.test>',
			to: ['ada@example.test'],
			subject: message.subject,
			text: message.text,
			html: message.html
		});
	});

	function refusing(body: string, status: number) {
		const fetchImpl = vi.fn(() => Promise.resolve(new Response(body, { status })));
		return createMailer(
			{ from: 'x@example.test', transport: { kind: 'resend', apiKey: 're_123' } },
			fetchImpl as unknown as typeof fetch
		);
	}

	it('rejects with the status and the error name when Resend refuses', async () => {
		const mailer = refusing(
			JSON.stringify({ statusCode: 403, name: 'invalid_api_key', message: 'API key is invalid' }),
			403
		);
		await expect(mailer.send(message)).rejects.toThrow(
			'Resend refused the message (403): invalid_api_key'
		);
	});

	/** The error is logged, and a validation message can quote the recipient. */
	it('never puts the message text, which can name the address, in the error', async () => {
		const mailer = refusing(
			JSON.stringify({
				statusCode: 422,
				name: 'validation_error',
				message: 'Invalid `to` field: ada@example.test'
			}),
			422
		);
		const failure = await mailer.send(message).catch((error: unknown) => error);
		expect(String(failure)).toContain('validation_error');
		expect(String(failure)).not.toContain('ada@example.test');
	});

	/** The e2e suite's Workers run points this at a stand-in to read its mail. */
	it('posts to another root when given one', async () => {
		const fetchImpl = vi.fn((_url: string | URL | Request) =>
			Promise.resolve(new Response('{"id":"1"}', { status: 200 }))
		);
		await createMailer(
			{ from: 'x@example.test', transport: { kind: 'resend', apiKey: 're_123' } },
			fetchImpl as unknown as typeof fetch,
			'http://localhost:9999'
		).send(message);
		expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:9999/emails');
	});

	it('says unknown for a body that is not a Resend error', async () => {
		await expect(refusing('ada@example.test bounced', 500).send(message)).rejects.toThrow(
			'Resend refused the message (500): unknown'
		);
	});
});

describe('the outbox', () => {
	let dir: string | undefined;
	afterEach(async () => {
		if (dir) {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('writes each message as a JSON file, creating the directory', async () => {
		dir = await mkdtemp(join(tmpdir(), 'bound-up-outbox-test-'));
		const outbox = join(dir, 'nested');
		const mailer = createMailer({
			from: 'x@example.test',
			transport: { kind: 'outbox', dir: outbox }
		});
		await mailer.send(message);
		await mailer.send({ ...message, to: 'jun@example.test' });

		const files = (await readdir(outbox)).sort();
		expect(files).toHaveLength(2);
		const written = await Promise.all(
			files.map(
				async (file) => JSON.parse(await readFile(join(outbox, file), 'utf8')) as MailMessage
			)
		);
		expect(written.map((mail) => mail.to).sort()).toEqual(['ada@example.test', 'jun@example.test']);
		expect(written[0]).toMatchObject({
			from: 'x@example.test',
			subject: message.subject,
			text: message.text
		});
	});
});

describe('sendInBackground', () => {
	it('logs a failure without the address instead of rejecting', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const send = vi.fn(() => Promise.reject(new Error('provider down')));
		sendInBackground(undefined, { send }, message, 'verification');
		await vi.waitFor(() => expect(error).toHaveBeenCalled());
		expect(String(error.mock.calls[0]?.[0])).toBe('mail: could not send the verification email');
		expect(JSON.stringify(error.mock.calls)).not.toContain('ada@example.test');
		error.mockRestore();
	});

	it('sends only once its condition allows, and drops the message otherwise', async () => {
		const send = vi.fn(() => Promise.resolve());
		sendInBackground(undefined, { send }, message, 'verification', () => Promise.resolve(true));
		await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());

		const refused = vi.fn(() => Promise.resolve());
		const condition = vi.fn(() => Promise.resolve(false));
		sendInBackground(undefined, { send: refused }, message, 'verification', condition);
		await vi.waitFor(() => expect(condition).toHaveBeenCalledOnce());
		await Promise.resolve();
		expect(refused).not.toHaveBeenCalled();
	});

	it('hands the send to waitUntil on Workers', () => {
		const waitUntil = vi.fn();
		const platform = { ctx: { waitUntil } } as unknown as App.Platform;
		sendInBackground(platform, { send: () => Promise.resolve() }, message, 'verification');
		expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
	});
});

describe('resendBaseUrl', () => {
	it('is Resend itself unless the test seam is set', () => {
		expect(resendBaseUrl(undefined)).toBe('https://api.resend.com');
	});

	it('takes the seam from the platform, without a trailing slash', () => {
		const platform = {
			env: { RESEND_BASE_URL: 'http://localhost:4000/' }
		} as unknown as App.Platform;
		expect(resendBaseUrl(platform)).toBe('http://localhost:4000');
	});

	it('refuses something that is not an http(s) URL, saying how to fix it', () => {
		const platform = { env: { RESEND_BASE_URL: 'ftp://nope' } } as unknown as App.Platform;
		expect(() => resendBaseUrl(platform)).toThrow(/Unset it to use Resend itself/);
	});
});
