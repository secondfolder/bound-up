import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/db/schema';
import { savePushSubscription } from '$lib/server/push';
import { loadServerSettings, saveServerSettings } from '$lib/server/settings';
import type { ServerSettingKey } from '$lib/server-settings';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

let harness: TestDb;
let db: Db;
let admin: TestUser;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	admin = await createTestUser(db, { name: 'Admin', role: 'admin' });
	ada = await createTestUser(db, { name: 'Ada', role: 'user' });
	// A base URL per test, since OpenRouter's list is cached per URL, and
	// nothing reaching the real one: saving a custom story model asks it
	// whether the model calls tools.
	env.OPENROUTER_BASE_URL = `https://models-${crypto.randomUUID()}.test/v1`;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () =>
			Response.json({
				data: [
					{ id: 'vendor/x' },
					{ id: 'z-ai/glm-5.2', supported_parameters: ['max_tokens', 'tools'] }
				]
			})
		)
	);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
});

/** The settings as the request would see them: read from this test's database. */
async function event(user: TestUser, formData?: Record<string, string>) {
	const settings = await loadServerSettings(db, undefined);
	return fakeEvent({
		db,
		user,
		path: '/admin/server',
		settings,
		...(formData ? { formData } : {})
	});
}

async function stored(key: ServerSettingKey): Promise<string> {
	return (await loadServerSettings(db, undefined))[key];
}

const mail = {
	mailFrom: 'Bound Up <hi@example.test>',
	mailTransport: 'resend',
	resendApiKey: 're_secret_value_1234',
	resendApiKeyChange: 'keep',
	smtpUrl: '',
	smtpUrlChange: 'keep',
	mailOutboxDir: ''
};

describe('load', () => {
	it('is a 404 for anyone but an admin', async () => {
		expect(await runAndCatch(async () => load(await event(ada)))).toMatchObject({
			type: 'error',
			status: 404
		});
	});

	it('says a credential is set, and how it ends, but never sends it', async () => {
		await saveServerSettings(db, { openrouterApiKey: 'sk-or-v1-abcdefghijklmnop' });
		const data = await runLoad(load(await event(admin)));
		expect(data.secrets.openrouterApiKey).toEqual({ set: true, tail: 'mnop' });
		expect(data.secrets.runwareApiKey).toEqual({ set: false, tail: '' });
		const serialised = JSON.stringify(data);
		expect(serialised).not.toContain('sk-or-v1-abcdefghijklmnop');
		expect(serialised).not.toContain((await loadServerSettings(db, undefined)).serverSecret);
		expect(serialised).not.toContain((await loadServerSettings(db, undefined)).vapidPrivateKey);
	});

	it('starts each form from what is saved', async () => {
		await saveServerSettings(db, {
			storyModel: JSON.stringify({ openrouterModelId: 'some/model' }),
			photoModel: JSON.stringify({ runwareModelAir: 'civitai:1@2', base: 'pony' })
		});
		const data = await runLoad(load(await event(admin)));
		expect(data.languageModelForm.data).toMatchObject({
			storyProvider: 'openrouter',
			storyModel: 'custom',
			openrouterModelId: 'some/model'
		});
		expect(data.imageModelForm.data).toMatchObject({
			photoProvider: 'runware',
			photoModel: 'custom',
			photoRunwareModelAir: 'civitai:1@2',
			photoBase: 'pony',
			illustratedModel: 'wai-illustrious'
		});
		// One key form per provider, each empty: a stored key is never sent.
		expect(data.providerForms.openrouter.data).toEqual({
			provider: 'openrouter',
			apiKey: '',
			apiKeyChange: 'keep'
		});
		expect(data.providerForms.runware.data.provider).toBe('runware');
	});
});

describe('actions', () => {
	it.each([
		['saveMail', mail],
		['saveModelProvider', { provider: 'openrouter', apiKey: 'sk-or-stolen', apiKeyChange: 'keep' }],
		['saveLanguageModels', { storyProvider: 'openrouter', storyModel: 'hermes' }],
		[
			'saveImageModels',
			{
				photoProvider: 'runware',
				photoModel: 'dark-beast',
				illustratedProvider: 'runware',
				illustratedModel: 'wai-illustrious'
			}
		],
		['savePush', { vapidSubject: '' }],
		['testEmail', {}],
		['regenerateVapid', {}],
		['regenerateServerSecret', {}]
	])('%s is a 404 for anyone but an admin', async (name, formData) => {
		const before = await loadServerSettings(db, undefined);
		expect(
			await runAndCatch(async () => runAction(actions, name, await event(ada, formData)))
		).toMatchObject({ type: 'error', status: 404 });
		expect(await loadServerSettings(db, undefined)).toEqual(before);
	});

	it('saves the email settings, and keeps a credential left empty', async () => {
		await runAction(actions, 'saveMail', await event(admin, mail));
		expect(await stored('resendApiKey')).toBe('re_secret_value_1234');
		expect(await stored('mailTransport')).toBe('resend');

		await runAction(actions, 'saveMail', await event(admin, { ...mail, resendApiKey: '' }));
		expect(await stored('resendApiKey')).toBe('re_secret_value_1234');
	});

	it('removes a credential when asked, and refuses a transport left without one', async () => {
		await saveServerSettings(db, { resendApiKey: 're_old' });
		const result = await runAction(
			actions,
			'saveMail',
			await event(admin, { ...mail, resendApiKey: '', resendApiKeyChange: 'remove' })
		);
		expect(result).toMatchObject({ status: 400 });
		expect(await stored('resendApiKey')).toBe('re_old');

		await runAction(
			actions,
			'saveMail',
			await event(admin, {
				...mail,
				mailTransport: 'outbox',
				mailOutboxDir: './out',
				resendApiKey: '',
				resendApiKeyChange: 'remove'
			})
		);
		expect(await stored('resendApiKey')).toBe('');
		expect(await stored('mailTransport')).toBe('outbox');
	});

	it('refuses an address that is not one', async () => {
		const result = await runAction(
			actions,
			'saveMail',
			await event(admin, { ...mail, mailFrom: 'not an address' })
		);
		expect(result).toMatchObject({ status: 400 });
		expect(await stored('mailFrom')).toBe('');
	});

	it('saves a provider’s key under that provider’s own setting, keeps it, and removes it', async () => {
		const save = async (formData: Record<string, string>) =>
			runAction(actions, 'saveModelProvider', await event(admin, formData));
		const saved = await save({
			provider: 'runware',
			apiKey: 'rw-key-for-pictures',
			apiKeyChange: 'keep'
		});
		expect(await stored('runwareApiKey')).toBe('rw-key-for-pictures');
		expect(await stored('openrouterApiKey')).toBe('');
		// Handed back cleared, so it is not posted again, and never echoed.
		expect(saved).toMatchObject({ form: { data: { apiKey: '' }, message: 'Saved.' } });
		expect(JSON.stringify(saved)).not.toContain('rw-key-for-pictures');

		await save({ provider: 'runware', apiKey: '', apiKeyChange: 'keep' });
		expect(await stored('runwareApiKey')).toBe('rw-key-for-pictures');

		await save({ provider: 'runware', apiKey: '', apiKeyChange: 'remove' });
		expect(await stored('runwareApiKey')).toBe('');
	});

	it('refuses a provider it does not know, rather than saving a key anywhere', async () => {
		const before = await loadServerSettings(db, undefined);
		const refused = await runAction(
			actions,
			'saveModelProvider',
			await event(admin, { provider: 'serverSecret', apiKey: 'x', apiKeyChange: 'keep' })
		);
		expect(refused).toMatchObject({ status: 400 });
		expect(await loadServerSettings(db, undefined)).toEqual(before);
	});

	it('saves a preset story model by name, and a custom one by its OpenRouter id', async () => {
		const daydreams = { storyProvider: 'openrouter' };
		await runAction(
			actions,
			'saveLanguageModels',
			await event(admin, { ...daydreams, storyModel: 'euryale', openrouterModelId: '' })
		);
		expect(JSON.parse(await stored('storyModel'))).toEqual({
			provider: 'openrouter',
			preset: 'euryale'
		});

		await runAction(
			actions,
			'saveLanguageModels',
			await event(admin, { ...daydreams, storyModel: 'custom', openrouterModelId: 'vendor/x' })
		);
		expect(JSON.parse(await stored('storyModel'))).toEqual({
			provider: 'openrouter',
			openrouterModelId: 'vendor/x'
		});

		await runAction(
			actions,
			'saveLanguageModels',
			await event(admin, {
				...daydreams,
				storyModel: 'custom',
				openrouterModelId: 'z-ai/glm-5.2@preset/nsfw-compatible'
			})
		);
		expect(JSON.parse(await stored('storyModel'))).toEqual({
			provider: 'openrouter',
			openrouterModelId: 'z-ai/glm-5.2@preset/nsfw-compatible',
			tools: true
		});
		expect(await runLoad(load(await event(admin)))).toMatchObject({ storyModelReadsLinks: true });

		const refused = await runAction(
			actions,
			'saveLanguageModels',
			await event(admin, { ...daydreams, storyModel: 'custom', openrouterModelId: 'no slash' })
		);
		expect(refused).toMatchObject({ status: 400 });

		// A preset is one of the chosen provider's, or nothing.
		const otherProvider = await runAction(
			actions,
			'saveLanguageModels',
			await event(admin, { ...daydreams, storyModel: 'dark-beast', openrouterModelId: '' })
		);
		expect(otherProvider).toMatchObject({ status: 400 });
		const unknownProvider = await runAction(
			actions,
			'saveLanguageModels',
			await event(admin, { storyProvider: 'runware', storyModel: 'hermes', openrouterModelId: '' })
		);
		expect(unknownProvider).toMatchObject({ status: 400 });
	});

	it('saves a custom story model without tools when OpenRouter cannot be asked', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
		const saved = await runAction(
			actions,
			'saveLanguageModels',
			await event(admin, {
				storyProvider: 'openrouter',
				storyModel: 'custom',
				openrouterModelId: 'z-ai/glm-5.2'
			})
		);
		expect(saved).not.toMatchObject({ status: 400 });
		expect(JSON.parse(await stored('storyModel'))).toEqual({
			provider: 'openrouter',
			openrouterModelId: 'z-ai/glm-5.2'
		});
	});

	it('saves a research model only if OpenRouter lists it as calling tools', async () => {
		const save = async (researchModelId: string) =>
			runAction(
				actions,
				'saveLanguageModels',
				await event(admin, {
					storyProvider: 'openrouter',
					storyModel: 'hermes',
					openrouterModelId: '',
					researchModelId
				})
			);
		expect(await save('z-ai/glm-5.2')).not.toMatchObject({ status: 400 });
		expect(await stored('researchModel')).toBe('z-ai/glm-5.2');
		expect((await runLoad(load(await event(admin)))).languageModelForm.data).toMatchObject({
			researchModelId: 'z-ai/glm-5.2'
		});

		const refused = await save('vendor/no-tools');
		expect(refused).toMatchObject({ status: 400 });
		expect(await stored('researchModel')).toBe('z-ai/glm-5.2');

		expect(await save('')).not.toMatchObject({ status: 400 });
		expect(await stored('researchModel')).toBe('');
	});

	it('saves a custom picture model with its base model, and refuses one without', async () => {
		const pictures = {
			photoProvider: 'runware',
			photoModel: 'custom',
			photoRunwareModelAir: 'civitai:1@2',
			photoBase: 'pony',
			illustratedProvider: 'runware',
			illustratedModel: 'wai-illustrious',
			illustratedRunwareModelAir: '',
			illustratedBase: ''
		};
		await runAction(actions, 'saveImageModels', await event(admin, pictures));
		expect(JSON.parse(await stored('photoModel'))).toEqual({
			provider: 'runware',
			runwareModelAir: 'civitai:1@2',
			base: 'pony'
		});
		expect(JSON.parse(await stored('illustratedModel'))).toEqual({
			provider: 'runware',
			preset: 'wai-illustrious'
		});

		const refused = await runAction(
			actions,
			'saveImageModels',
			await event(admin, { ...pictures, photoBase: '' })
		);
		expect(refused).toMatchObject({ status: 400 });
	});

	it('saves a push contact address, and refuses one push services would not take', async () => {
		await runAction(actions, 'savePush', await event(admin, { vapidSubject: 'mailto:a@b.test' }));
		expect(await stored('vapidSubject')).toBe('mailto:a@b.test');
		expect(
			await runAction(actions, 'savePush', await event(admin, { vapidSubject: 'a@b.test' }))
		).toMatchObject({ status: 400 });
	});

	it('sends a test email to the admin, and says why when it cannot', async () => {
		// Not the unset mailer: under vitest `dev` is true, so that is the local
		// outbox, which would write into the checkout.
		await saveServerSettings(db, {
			mailFrom: 'Bound Up <hi@example.test>',
			mailTransport: 'resend'
		});
		const notSetUp = await runAction(actions, 'testEmail', await event(admin, {}));
		expect(JSON.stringify(notSetUp)).toContain('no API key is set');

		await saveServerSettings(db, {
			mailFrom: 'Bound Up <hi@example.test>',
			mailTransport: 'resend',
			resendApiKey: 're_test'
		});
		const resend = vi.fn(async () => Response.json({ id: 'sent' }));
		vi.stubGlobal('fetch', resend);
		const sent = await runAction(actions, 'testEmail', await event(admin, {}));
		expect(sent).toMatchObject({ form: { message: `Sent to ${admin.email}.` } });
		const [, init] = resend.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(String(init.body)).to).toEqual([admin.email]);

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ name: 'invalid_api_key' }, { status: 403 }))
		);
		const refused = await runAction(actions, 'testEmail', await event(admin, {}));
		expect(JSON.stringify(refused)).toContain('invalid_api_key');
	});

	it('regenerates the push keys, dropping every device', async () => {
		const before = await loadServerSettings(db, undefined);
		await savePushSubscription(db, ada.id, {
			endpoint: 'https://push.example.test/1',
			p256dh: 'p',
			auth: 'a',
			label: 'Phone'
		});
		await runAction(actions, 'regenerateVapid', await event(admin, {}));
		expect(await stored('vapidPublicKey')).not.toBe(before.vapidPublicKey);
		expect(await db.select().from(pushSubscriptions)).toEqual([]);
	});

	it('regenerates the auth secret, and sends the admin to sign in again', async () => {
		const before = await stored('serverSecret');
		expect(
			await runAndCatch(async () =>
				runAction(actions, 'regenerateServerSecret', await event(admin, {}))
			)
		).toMatchObject({ type: 'redirect', location: '/login' });
		expect(await stored('serverSecret')).not.toBe(before);
	});
});
