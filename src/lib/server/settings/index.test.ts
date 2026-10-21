import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '$lib/server/db';
import { pushSubscriptions, serverSettings } from '$lib/server/db/schema';
import { savePushSubscription } from '$lib/server/push';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { createTestUser } from '$lib/testing/fixtures';
import {
	loadServerSettingRows,
	loadServerSettings,
	regenerateServerSecret,
	regenerateVapidKeys,
	saveServerSettings
} from '.';

/** The process environment, for the one-time import from it. */
const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

let harness: TestDb;
let db: Db;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
});

afterEach(() => {
	harness.close();
	for (const key of Object.keys(env)) {
		delete env[key];
	}
});

describe('loadServerSettings', () => {
	it('generates an auth secret and a push key pair the first time, and keeps them', async () => {
		const first = await loadServerSettings(db, undefined);
		expect(first.serverSecret).toMatch(/^[0-9a-f]{64}$/);
		// An uncompressed P-256 point is 65 bytes, 87 characters of base64url.
		expect(first.vapidPublicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
		expect(first.vapidPrivateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(await loadServerSettings(db, undefined)).toEqual(first);

		const rows = await loadServerSettingRows(db, undefined);
		expect(rows.serverSecret?.source).toBe('generated');
	});

	it('agrees with itself when two requests fill in the missing settings at once', async () => {
		const [one, two] = await Promise.all([
			loadServerSettings(db, undefined),
			loadServerSettings(db, undefined)
		]);
		expect(one.serverSecret).toBe(two.serverSecret);
		expect(one.vapidPublicKey).toBe(two.vapidPublicKey);
		expect(one.vapidPrivateKey).toBe(two.vapidPrivateKey);
	});

	it('is empty for every setting nothing filled', async () => {
		const settings = await loadServerSettings(db, undefined);
		expect(settings.openrouterApiKey).toBe('');
		expect(settings.mailTransport).toBe('');
	});
});

describe('the one-time import from the environment', () => {
	it('copies an old variable into a missing setting, saying where it came from', async () => {
		env.BETTER_AUTH_SECRET = 'the-production-secret';
		env.OPENROUTER_API_KEY = 'sk-or-old';
		env.MAIL_FROM = 'Bound Up <hi@example.test>';
		env.RESEND_API_KEY = 're_old';
		const settings = await loadServerSettings(db, undefined);
		expect(settings).toMatchObject({
			serverSecret: 'the-production-secret',
			openrouterApiKey: 'sk-or-old',
			mailFrom: 'Bound Up <hi@example.test>',
			resendApiKey: 're_old',
			mailTransport: 'resend'
		});
		const rows = await loadServerSettingRows(db, undefined);
		expect(rows.serverSecret?.source).toBe('imported');
	});

	it('reads Workers’ platform.env before the process environment', async () => {
		env.OPENROUTER_API_KEY = 'from-process';
		const platform = { env: { OPENROUTER_API_KEY: 'from-workers' } } as unknown as App.Platform;
		expect((await loadServerSettings(db, platform)).openrouterApiKey).toBe('from-workers');
	});

	it('never replaces what is stored, nor brings back what an admin cleared', async () => {
		await saveServerSettings(db, { openrouterApiKey: 'sk-or-new', runwareApiKey: '' });
		env.OPENROUTER_API_KEY = 'sk-or-old';
		env.RUNWARE_AI_API_KEY = 'rw-old';
		const settings = await loadServerSettings(db, undefined);
		expect(settings.openrouterApiKey).toBe('sk-or-new');
		expect(settings.runwareApiKey).toBe('');
	});

	it('takes the push keys as a pair or not at all', async () => {
		env.VAPID_PUBLIC_KEY = 'only-the-public-half';
		const settings = await loadServerSettings(db, undefined);
		expect(settings.vapidPublicKey).not.toBe('only-the-public-half');
		expect(settings.vapidPrivateKey).not.toBe('');
	});

	it('leaves the transport unchosen when more than one was set', async () => {
		env.RESEND_API_KEY = 're_x';
		env.SMTP_URL = 'smtp://mail.example.test';
		const settings = await loadServerSettings(db, undefined);
		expect(settings.mailTransport).toBe('');
		expect(settings.resendApiKey).toBe('re_x');
	});

	it('turns a model id into its preset, and keeps any other as a custom choice', async () => {
		env.DAYDREAM_MODEL = 'nousresearch/hermes-3-llama-3.1-70b';
		env.RUNWARE_AI_IMAGE_MODEL = 'civitai:573152@1094291';
		env.RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED = 'civitai:999@999';
		const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const settings = await loadServerSettings(db, undefined);
		expect(JSON.parse(settings.storyModel)).toEqual({ provider: 'openrouter', preset: 'hermes' });
		expect(JSON.parse(settings.photoModel)).toEqual({ provider: 'runware', preset: 'lustify' });
		// Its base model cannot be known, so it is not imported, and says so.
		expect(settings.illustratedModel).toBe('');
		expect(String(warned.mock.calls[0]?.[0])).toContain('RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED');
		warned.mockRestore();

		await harness.db.delete(serverSettings);
		env.DAYDREAM_MODEL = 'some/model';
		expect(JSON.parse((await loadServerSettings(db, undefined)).storyModel)).toEqual({
			provider: 'openrouter',
			openrouterModelId: 'some/model'
		});
	});
});

describe('regenerating', () => {
	it('replaces the auth secret', async () => {
		const before = await loadServerSettings(db, undefined);
		await regenerateServerSecret(db);
		const after = await loadServerSettings(db, undefined);
		expect(after.serverSecret).not.toBe(before.serverSecret);
		expect(after.serverSecret).toMatch(/^[0-9a-f]{64}$/);
	});

	it('replaces the push keys, and drops every device subscribed with the old ones', async () => {
		const before = await loadServerSettings(db, undefined);
		const ada = await createTestUser(db);
		await savePushSubscription(db, ada.id, {
			endpoint: 'https://push.example.test/1',
			p256dh: 'p',
			auth: 'a',
			label: 'Phone'
		});
		await regenerateVapidKeys(db);
		const after = await loadServerSettings(db, undefined);
		expect(after.vapidPublicKey).not.toBe(before.vapidPublicKey);
		expect(after.vapidPrivateKey).not.toBe(before.vapidPrivateKey);
		expect(await db.select().from(pushSubscriptions)).toEqual([]);
	});
});
