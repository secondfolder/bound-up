import { fail, redirect } from '@sveltejs/kit';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { dev } from '$app/environment';
import { splitOpenRouterModelId } from '$lib/model-search';
import {
	imageModelSettingsFormSchema,
	languageModelSettingsFormSchema,
	mailSettingsFormSchema,
	modelProviderFormSchema,
	providerOverrideFormSchema,
	pushSettingsFormSchema,
	type SecretChange,
	serverActionFormSchema
} from '$lib/schemas/serverSettingsForms';
import { requireAdmin } from '$lib/server/admin';
import { openrouterBaseUrl } from '$lib/server/daydream/config';
import { createMailer, resendBaseUrl } from '$lib/server/mail';
import { MAIL_NODE_TARGET, MailNotSetUpError, readMailConfig } from '$lib/server/mail/config';
import { checkModel, openRouterEndpoints } from '$lib/server/model-providers/check';
import { loadProviderStates, setOverride } from '$lib/server/model-providers/store';
import { loadOpenRouterCatalogue } from '$lib/server/openrouter-models';
import { defaultVapidSubject } from '$lib/server/push';
import {
	loadServerSettingRows,
	regenerateServerSecret,
	regenerateVapidKeys,
	saveServerSettings,
	settingsFromRows
} from '$lib/server/settings';
import { legacyEnvStillSet } from '$lib/server/settings/legacy-env';
import { serverSettingsStatus } from '$lib/server/settings/status';
import {
	MODEL_PROVIDER_IDS,
	MODEL_PROVIDERS,
	type ModelProviderId,
	type OpenRouterStoryModelPresetId,
	openrouterModelIdFor,
	PICTURE_MODEL_SETTING,
	type PictureModelChoice,
	parsePictureModel,
	parseResearchModel,
	parseStoryModel,
	providerCredential,
	SECRET_SETTING_KEYS,
	type ServerSettingKey,
	type ServerSettings,
	type StoryModelChoice,
	secretTail,
	storyModelCallsTools
} from '$lib/server-settings';
import type { Actions, PageServerLoad } from './$types';

// Several superforms on one page, told apart by id.
const MAIL_FORM = 'mail';
const TEST_EMAIL_FORM = 'test-email';
const LANGUAGE_MODEL_FORM = 'language-models';
const IMAGE_MODEL_FORM = 'image-models';
const PUSH_FORM = 'push';
const VAPID_FORM = 'vapid';
const SERVER_SECRET_FORM = 'server-secret';
const PROVIDER_CHECK_FORM = 'provider-check';
const PROVIDER_OVERRIDE_FORM = 'provider-override';

/** The story model as OpenRouter lists it: what its providers are stored under. */
function listedStoryModel(settings: ServerSettings): string {
	return splitOpenRouterModelId(openrouterModelIdFor(parseStoryModel(settings.storyModel))).listed;
}
/** One form per model provider, for its key. */
const providerFormId = (provider: ModelProviderId) => `provider-${provider}`;

/** A credential as the browser may see it: whether it is set, and its last few characters. */
export type StoredSecret = { set: boolean; tail: string };

function stored(settings: ServerSettings, key: ServerSettingKey): StoredSecret {
	const value = settings[key].trim();
	return { set: value !== '', tail: secretTail(value) };
}

/**
 * Whether OpenRouter lists a model as calling tools, for a story model being
 * saved: what decides whether a daydream brief's links are read
 * (docs/daydreams.md, "Links in a brief"). Asked once, when it is saved,
 * rather than on every suggestion. When OpenRouter cannot say, no: the model
 * still works, and saving it again later asks again.
 */
async function callsTools(
	openrouterModelId: string,
	platform: App.Platform | undefined,
	signal: AbortSignal
): Promise<boolean> {
	const { listed } = splitOpenRouterModelId(openrouterModelId);
	try {
		const models = await loadOpenRouterCatalogue(openrouterBaseUrl(platform), signal);
		return models.some((model) => model.openrouterModelId === listed && model.tools);
	} catch {
		return false;
	}
}

/** The story model as saved: a preset by name, a custom one with whether it calls tools. */
async function storyModelChoice(
	data: { storyProvider: 'openrouter'; storyModel: string; openrouterModelId: string },
	platform: App.Platform | undefined,
	signal: AbortSignal
): Promise<StoryModelChoice> {
	const provider = data.storyProvider;
	if (data.storyModel !== 'custom') {
		return { provider, preset: data.storyModel as OpenRouterStoryModelPresetId };
	}
	const { openrouterModelId } = data;
	return (await callsTools(openrouterModelId, platform, signal))
		? { provider, openrouterModelId, tools: true }
		: { provider, openrouterModelId };
}

function pictureFields(settings: ServerSettings, style: 'photo' | 'illustrated') {
	const choice = parsePictureModel(style, settings[PICTURE_MODEL_SETTING[style]]);
	return 'runwareModelAir' in choice
		? { provider: choice.provider, model: 'custom', air: choice.runwareModelAir, base: choice.base }
		: { provider: choice.provider, model: choice.preset, air: '', base: '' as const };
}

/** A provider's key form, empty: the stored key is never sent. */
function emptyProviderForm(provider: ModelProviderId) {
	return superValidate(
		{ provider, apiKey: '', apiKeyChange: 'keep' as const },
		zod4(modelProviderFormSchema),
		{ id: providerFormId(provider), errors: false }
	);
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	const admin = requireAdmin(locals);
	// Read again rather than taken from `locals.settings`, for two reasons:
	// after an action, this load runs in the same request, and
	// `locals.settings` is from before the action wrote; and the page says
	// where each secret came from — generated here, or carried over from the
	// environment — which only the rows know.
	const rows = await loadServerSettingRows(locals.db, platform);
	const settings = settingsFromRows(rows);
	const story = parseStoryModel(settings.storyModel);
	const storyModelListed = listedStoryModel(settings);
	const photo = pictureFields(settings, 'photo');
	const illustrated = pictureFields(settings, 'illustrated');

	return {
		adminEmail: admin.email,
		status: serverSettingsStatus(settings),
		/** Whether the story model can read the links in a daydream's brief. */
		storyModelReadsLinks: storyModelCallsTools(story),
		/** Whether SMTP and the outbox can work here: not on Workers. */
		nodeTarget: MAIL_NODE_TARGET,
		dev,
		secrets: Object.fromEntries(
			[...SECRET_SETTING_KEYS].map((key) => [key, stored(settings, key)])
		) as Record<ServerSettingKey, StoredSecret>,
		serverSecret: {
			source: rows.serverSecret?.source ?? 'generated',
			updatedAt: rows.serverSecret?.updatedAt ?? null
		},
		vapid: {
			publicKey: settings.vapidPublicKey,
			source: rows.vapidPublicKey?.source ?? 'generated',
			updatedAt: rows.vapidPublicKey?.updatedAt ?? null,
			defaultSubject: defaultVapidSubject(settings.mailFrom)
		},
		// TEMPORARY, with `legacy-env.ts`: which old variables are still set.
		legacyEnv: legacyEnvStillSet(platform),
		mailForm: await superValidate(
			{
				mailFrom: settings.mailFrom,
				mailTransport: settings.mailTransport as '' | 'resend' | 'smtp' | 'outbox',
				resendApiKey: '',
				resendApiKeyChange: 'keep',
				smtpUrl: '',
				smtpUrlChange: 'keep',
				mailOutboxDir: settings.mailOutboxDir
			},
			zod4(mailSettingsFormSchema),
			{ id: MAIL_FORM, errors: false }
		),
		testEmailForm: await superValidate(zod4(serverActionFormSchema), { id: TEST_EMAIL_FORM }),
		providerForms: Object.fromEntries(
			await Promise.all(
				MODEL_PROVIDER_IDS.map(async (provider) => [provider, await emptyProviderForm(provider)])
			)
		) as Record<ModelProviderId, Awaited<ReturnType<typeof emptyProviderForm>>>,
		languageModelForm: await superValidate(
			{
				storyProvider: story.provider,
				storyModel: 'preset' in story ? story.preset : 'custom',
				openrouterModelId: 'openrouterModelId' in story ? story.openrouterModelId : '',
				researchModelId: parseResearchModel(settings.researchModel) ?? ''
			},
			zod4(languageModelSettingsFormSchema),
			{ id: LANGUAGE_MODEL_FORM, errors: false }
		),
		imageModelForm: await superValidate(
			{
				photoProvider: photo.provider,
				photoModel: photo.model,
				photoRunwareModelAir: photo.air,
				photoBase: photo.base,
				illustratedProvider: illustrated.provider,
				illustratedModel: illustrated.model,
				illustratedRunwareModelAir: illustrated.air,
				illustratedBase: illustrated.base
			},
			zod4(imageModelSettingsFormSchema),
			{ id: IMAGE_MODEL_FORM, errors: false }
		),
		pushForm: await superValidate(
			{ vapidSubject: settings.vapidSubject },
			zod4(pushSettingsFormSchema),
			{ id: PUSH_FORM, errors: false }
		),
		vapidForm: await superValidate(zod4(serverActionFormSchema), { id: VAPID_FORM }),
		serverSecretForm: await superValidate(zod4(serverActionFormSchema), { id: SERVER_SECRET_FORM }),
		/** The story model's providers: their adult-content checks, overrides and health. */
		storyModelListed,
		storyProviders: await loadProviderStates(locals.db, {
			model: storyModelListed,
			kind: 'language'
		}),
		providerCheckForm: await superValidate(zod4(serverActionFormSchema), {
			id: PROVIDER_CHECK_FORM
		}),
		providerOverrideForm: await superValidate(zod4(providerOverrideFormSchema), {
			id: PROVIDER_OVERRIDE_FORM,
			errors: false
		})
	};
};

/**
 * What a credential becomes: nothing, if it is being removed; what was typed,
 * if anything was; otherwise what is stored. The browser never has the stored
 * value, so an empty field is the only way to leave it as it is.
 */
function secretAfter(current: string, change: SecretChange, typed: string): string {
	if (change === 'remove') {
		return '';
	}
	return typed || current;
}

const SAVED = 'Saved.';

export const actions: Actions = {
	saveMail: async ({ locals, request }) => {
		requireAdmin(locals);
		const mailForm = await superValidate(request, zod4(mailSettingsFormSchema), { id: MAIL_FORM });
		if (!mailForm.valid) {
			return fail(400, { mailForm });
		}
		const { data } = mailForm;
		const resendApiKey = secretAfter(
			locals.settings.resendApiKey,
			data.resendApiKeyChange,
			data.resendApiKey
		);
		const smtpUrl = secretAfter(locals.settings.smtpUrl, data.smtpUrlChange, data.smtpUrl);
		// Checked against what will be stored, which only the server knows.
		if (data.mailTransport === 'resend' && !resendApiKey) {
			return setError(mailForm, 'resendApiKey', 'Paste a Resend API key to send through Resend.');
		}
		if (data.mailTransport === 'smtp' && !smtpUrl) {
			return setError(mailForm, 'smtpUrl', 'Paste the SMTP server’s URL to send through it.');
		}
		if ((data.mailTransport === 'smtp' || data.mailTransport === 'outbox') && !MAIL_NODE_TARGET) {
			return setError(
				mailForm,
				'mailTransport',
				'On Cloudflare Workers, email can only go through Resend.'
			);
		}

		await saveServerSettings(locals.db, {
			mailFrom: data.mailFrom,
			mailTransport: data.mailTransport,
			resendApiKey,
			smtpUrl,
			mailOutboxDir: data.mailOutboxDir
		});
		// Back to "keep", with nothing typed: what was typed is stored now, and
		// must not sit in the form to be posted again as a replacement.
		mailForm.data = {
			...data,
			resendApiKey: '',
			resendApiKeyChange: 'keep',
			smtpUrl: '',
			smtpUrlChange: 'keep'
		};
		return message(mailForm, SAVED);
	},

	/**
	 * Sends a test email to the admin's own address, and waits for it.
	 *
	 * Every other email is handed to `sendInBackground` and never awaited,
	 * because a response that waited could tell a stranger whether an address
	 * has an account. That cannot apply here — it goes to the address of the
	 * admin pressing the button — and the whole point is to say whether it
	 * worked.
	 */
	testEmail: async ({ locals, platform, request }) => {
		const admin = requireAdmin(locals);
		const testEmailForm = await superValidate(request, zod4(serverActionFormSchema), {
			id: TEST_EMAIL_FORM
		});
		try {
			await createMailer(readMailConfig(locals.settings), fetch, resendBaseUrl(platform)).send({
				to: admin.email,
				subject: 'A test email from your server',
				text: 'If you can read this, your server can send email.',
				html: '<p>If you can read this, your server can send email.</p>'
			});
		} catch (error) {
			// The server's own configuration and the provider's error code, never
			// anyone's content: the message is safe to show the admin.
			const reason = error instanceof Error ? error.message : String(error);
			return setError(
				testEmailForm,
				'',
				error instanceof MailNotSetUpError ? reason : `It didn’t send: ${reason}`
			);
		}
		return message(testEmailForm, `Sent to ${admin.email}.`);
	},

	/**
	 * One provider's key, which every model setting choosing that provider
	 * uses. Which provider is in the form; the key it is stored under comes
	 * from the registry, never from the browser.
	 */
	saveModelProvider: async ({ locals, request }) => {
		requireAdmin(locals);
		const providerForm = await superValidate(request, zod4(modelProviderFormSchema));
		if (!providerForm.valid) {
			return fail(400, { providerForm });
		}
		const { data } = providerForm;
		const key = MODEL_PROVIDERS[data.provider].credentialKey;
		await saveServerSettings(locals.db, {
			[key]: secretAfter(locals.settings[key], data.apiKeyChange, data.apiKey)
		});
		providerForm.data = { ...data, apiKey: '', apiKeyChange: 'keep' };
		return message(providerForm, SAVED);
	},

	saveLanguageModels: async ({ locals, platform, request }) => {
		requireAdmin(locals);
		const languageModelForm = await superValidate(request, zod4(languageModelSettingsFormSchema), {
			id: LANGUAGE_MODEL_FORM
		});
		if (!languageModelForm.valid) {
			return fail(400, { languageModelForm });
		}
		const { data } = languageModelForm;
		const story = await storyModelChoice(data, platform, request.signal);
		// A research model that cannot call tools would research nothing:
		// refused, rather than saved to fail quietly on every brief. Not asked
		// when the story model calls tools itself, which leaves it unused.
		if (
			data.researchModelId !== '' &&
			!storyModelCallsTools(story) &&
			!(await callsTools(data.researchModelId, platform, request.signal))
		) {
			return setError(
				languageModelForm,
				'researchModelId',
				'OpenRouter doesn’t list this model as calling tools, so it couldn’t read or search anything. Choose one that does.'
			);
		}
		await saveServerSettings(locals.db, {
			storyModel: JSON.stringify(story),
			researchModel: data.researchModelId
		});
		return message(languageModelForm, SAVED);
	},

	/**
	 * Asks every provider serving the story model the adult-content probes
	 * (docs/server-settings.md, "Adult content by provider"). The model and
	 * the key come from the saved settings, never the form.
	 */
	checkProviders: async ({ locals, platform, request }) => {
		requireAdmin(locals);
		const providerCheckForm = await superValidate(request, zod4(serverActionFormSchema), {
			id: PROVIDER_CHECK_FORM
		});
		const apiKey = providerCredential(locals.settings, 'openrouter');
		if (!apiKey) {
			return message(
				providerCheckForm,
				'Add an OpenRouter key under Model providers first: the check asks each provider through it.',
				{ status: 400 }
			);
		}
		const baseUrl = openrouterBaseUrl(platform);
		try {
			const results = await checkModel({
				db: locals.db,
				apiKey,
				baseUrl,
				model: listedStoryModel(locals.settings),
				kind: 'language',
				endpoints: openRouterEndpoints(baseUrl)
			});
			const passing = results.filter((result) => (result.levelPassed ?? 0) > 0).length;
			return message(
				providerCheckForm,
				`Checked ${results.length} providers: ${passing} allow adult content.`
			);
		} catch (error) {
			return message(
				providerCheckForm,
				error instanceof Error ? error.message : 'The check could not reach OpenRouter.',
				{ status: 502 }
			);
		}
	},

	setProviderOverride: async ({ locals, request }) => {
		requireAdmin(locals);
		const providerOverrideForm = await superValidate(request, zod4(providerOverrideFormSchema), {
			id: PROVIDER_OVERRIDE_FORM
		});
		if (!providerOverrideForm.valid) {
			return fail(400, { providerOverrideForm });
		}
		const key = { model: listedStoryModel(locals.settings), kind: 'language' as const };
		const known = await loadProviderStates(locals.db, key);
		const { provider, override } = providerOverrideForm.data;
		if (!known.some((state) => state.provider === provider)) {
			return setError(
				providerOverrideForm,
				'provider',
				'That provider isn’t one the story model has been checked on. Run the check first.'
			);
		}
		await setOverride(locals.db, key, provider, override);
		return message(providerOverrideForm, SAVED);
	},

	saveImageModels: async ({ locals, request }) => {
		requireAdmin(locals);
		const imageModelForm = await superValidate(request, zod4(imageModelSettingsFormSchema), {
			id: IMAGE_MODEL_FORM
		});
		if (!imageModelForm.valid) {
			return fail(400, { imageModelForm });
		}
		const { data } = imageModelForm;
		const choice = (
			provider: typeof data.photoProvider,
			model: string,
			air: string,
			base: string
		): PictureModelChoice =>
			model === 'custom'
				? { provider, runwareModelAir: air, base: base as Exclude<typeof data.photoBase, ''> }
				: { provider, preset: model };
		await saveServerSettings(locals.db, {
			photoModel: JSON.stringify(
				choice(data.photoProvider, data.photoModel, data.photoRunwareModelAir, data.photoBase)
			),
			illustratedModel: JSON.stringify(
				choice(
					data.illustratedProvider,
					data.illustratedModel,
					data.illustratedRunwareModelAir,
					data.illustratedBase
				)
			)
		});
		return message(imageModelForm, SAVED);
	},

	savePush: async ({ locals, request }) => {
		requireAdmin(locals);
		const pushForm = await superValidate(request, zod4(pushSettingsFormSchema), { id: PUSH_FORM });
		if (!pushForm.valid) {
			return fail(400, { pushForm });
		}
		await saveServerSettings(locals.db, { vapidSubject: pushForm.data.vapidSubject });
		return message(pushForm, SAVED);
	},

	regenerateVapid: async ({ locals, request }) => {
		requireAdmin(locals);
		const vapidForm = await superValidate(request, zod4(serverActionFormSchema), {
			id: VAPID_FORM
		});
		await regenerateVapidKeys(locals.db);
		return message(vapidForm, 'New keys made. Every device has to turn notifications on again.');
	},

	/**
	 * Signs everyone out, the admin included, so it ends on the login page:
	 * this session's cookie was signed with the secret just replaced.
	 */
	regenerateServerSecret: async ({ locals }) => {
		requireAdmin(locals);
		await regenerateServerSecret(locals.db);
		redirect(303, '/login');
	}
};
