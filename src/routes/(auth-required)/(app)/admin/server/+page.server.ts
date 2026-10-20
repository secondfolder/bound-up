import { fail, redirect } from '@sveltejs/kit';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { dev } from '$app/environment';
import { splitOpenRouterModelId } from '$lib/model-search';
import {
	type ImageModelSettingsForm,
	imageModelSettingsFormSchema,
	languageModelSettingsFormSchema,
	mailSettingsFormSchema,
	pushSettingsFormSchema,
	type SecretChange,
	serverActionFormSchema
} from '$lib/schemas/serverSettingsForms';
import { requireAdmin } from '$lib/server/admin';
import { openrouterBaseUrl } from '$lib/server/daydream/config';
import { createMailer } from '$lib/server/mail';
import { MAIL_NODE_TARGET, MailNotSetUpError, readMailConfig } from '$lib/server/mail/config';
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
	type OpenRouterStoryModelChoice,
	type OpenRouterStoryModelPresetId,
	parseOpenRouterStoryModel,
	parseRunwarePictureModel,
	RUNWARE_PICTURE_MODEL_SETTING,
	type RunwarePictureModelChoice,
	SECRET_SETTING_KEYS,
	type ServerSettingKey,
	type ServerSettings,
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
	data: { storyModel: string; openrouterModelId: string },
	platform: App.Platform | undefined,
	signal: AbortSignal
): Promise<OpenRouterStoryModelChoice> {
	if (data.storyModel !== 'custom') {
		return { preset: data.storyModel as OpenRouterStoryModelPresetId };
	}
	const { openrouterModelId } = data;
	return (await callsTools(openrouterModelId, platform, signal))
		? { openrouterModelId, tools: true }
		: { openrouterModelId };
}

function pictureFields(settings: ServerSettings, style: 'photo' | 'illustrated') {
	const choice = parseRunwarePictureModel(style, settings[RUNWARE_PICTURE_MODEL_SETTING[style]]);
	return 'runwareModelAir' in choice
		? { model: 'custom', air: choice.runwareModelAir, base: choice.base }
		: { model: choice.preset, air: '', base: '' as const };
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
	const story = parseOpenRouterStoryModel(settings.openrouterStoryModel);
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
		languageModelForm: await superValidate(
			{
				openrouterApiKey: '',
				openrouterApiKeyChange: 'keep',
				storyModel: 'preset' in story ? story.preset : 'custom',
				openrouterModelId: 'openrouterModelId' in story ? story.openrouterModelId : ''
			},
			zod4(languageModelSettingsFormSchema),
			{ id: LANGUAGE_MODEL_FORM, errors: false }
		),
		imageModelForm: await superValidate(
			{
				runwareApiKey: '',
				runwareApiKeyChange: 'keep',
				photoModel: photo.model as ImageModelSettingsForm['photoModel'],
				photoRunwareModelAir: photo.air,
				photoBase: photo.base,
				illustratedModel: illustrated.model as ImageModelSettingsForm['illustratedModel'],
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
		serverSecretForm: await superValidate(zod4(serverActionFormSchema), { id: SERVER_SECRET_FORM })
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
	testEmail: async ({ locals, request }) => {
		const admin = requireAdmin(locals);
		const testEmailForm = await superValidate(request, zod4(serverActionFormSchema), {
			id: TEST_EMAIL_FORM
		});
		try {
			await createMailer(readMailConfig(locals.settings)).send({
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

	saveLanguageModels: async ({ locals, platform, request }) => {
		requireAdmin(locals);
		const languageModelForm = await superValidate(request, zod4(languageModelSettingsFormSchema), {
			id: LANGUAGE_MODEL_FORM
		});
		if (!languageModelForm.valid) {
			return fail(400, { languageModelForm });
		}
		const { data } = languageModelForm;
		await saveServerSettings(locals.db, {
			openrouterApiKey: secretAfter(
				locals.settings.openrouterApiKey,
				data.openrouterApiKeyChange,
				data.openrouterApiKey
			),
			openrouterStoryModel: JSON.stringify(await storyModelChoice(data, platform, request.signal))
		});
		languageModelForm.data = { ...data, openrouterApiKey: '', openrouterApiKeyChange: 'keep' };
		return message(languageModelForm, SAVED);
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
		const choice = (model: string, air: string, base: string): RunwarePictureModelChoice =>
			model === 'custom'
				? { runwareModelAir: air, base: base as Exclude<typeof data.photoBase, ''> }
				: { preset: model };
		await saveServerSettings(locals.db, {
			runwareApiKey: secretAfter(
				locals.settings.runwareApiKey,
				data.runwareApiKeyChange,
				data.runwareApiKey
			),
			runwarePhotoModel: JSON.stringify(
				choice(data.photoModel, data.photoRunwareModelAir, data.photoBase)
			),
			runwareIllustratedModel: JSON.stringify(
				choice(data.illustratedModel, data.illustratedRunwareModelAir, data.illustratedBase)
			)
		});
		imageModelForm.data = { ...data, runwareApiKey: '', runwareApiKeyChange: 'keep' };
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
