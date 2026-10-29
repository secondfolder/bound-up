import { z } from 'zod';
import type { PictureStyle } from '$lib/daydream';
import { OVERRIDES } from '$lib/model-providers';
import {
	FISH_VOICE_ID,
	FISH_VOICE_PRESETS,
	IMAGE_PROVIDERS,
	type ImageProviderId,
	LANGUAGE_PROVIDERS,
	MODEL_PROVIDER_IDS,
	type ModelProviderId,
	OPENROUTER_MODEL_ID,
	PICTURE_BASE_MODELS,
	PICTURE_MODEL_PRESETS,
	RUNWARE_MODEL_AIR,
	STORY_MODEL_PRESETS,
	VOICE_PROVIDERS
} from '$lib/server-settings';

/**
 * The forms on Admin → Server settings, one per card. See
 * docs/server-settings.md.
 *
 * A stored credential is never sent to the browser, so its field starts
 * empty and means "keep what is stored" until something is typed in it, which
 * replaces it. Removing one is said beside it, in `${field}Change`, because an
 * empty field already means keep.
 */

export const SECRET_CHANGES = ['keep', 'remove'] as const;
export type SecretChange = (typeof SECRET_CHANGES)[number];
const secretChange = z.enum(SECRET_CHANGES).default('keep');

/** `Name <a@b.c>` or a bare `a@b.c`, as a `From:` header takes it. */
const MAIL_FROM: RegExp =
	/^(?:[^<>]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;
const SMTP_URL: RegExp = /^smtps?:\/\//;

export const mailSettingsFormSchema = z
	.object({
		mailFrom: z.string().trim().max(200),
		mailTransport: z.enum(['', 'resend', 'smtp', 'outbox']),
		resendApiKey: z.string().trim().max(500),
		resendApiKeyChange: secretChange,
		smtpUrl: z.string().trim().max(1000),
		smtpUrlChange: secretChange,
		mailOutboxDir: z.string().trim().max(500)
	})
	.superRefine((data, context) => {
		if (data.mailFrom && !MAIL_FROM.test(data.mailFrom)) {
			context.addIssue({
				code: 'custom',
				path: ['mailFrom'],
				message: 'An address, or a name and an address: Bound Up <hello@example.com>'
			});
		}
		if (data.mailTransport && !data.mailFrom) {
			context.addIssue({
				code: 'custom',
				path: ['mailFrom'],
				message: 'Say who email comes from.'
			});
		}
		if (data.smtpUrl && !SMTP_URL.test(data.smtpUrl)) {
			context.addIssue({
				code: 'custom',
				path: ['smtpUrl'],
				message: 'Starts smtp:// or smtps://, e.g. smtps://user:password@mail.example.com'
			});
		}
		if (data.mailTransport === 'outbox' && !data.mailOutboxDir) {
			context.addIssue({
				code: 'custom',
				path: ['mailOutboxDir'],
				message: 'Say which folder to write email to.'
			});
		}
	});

export type MailSettingsForm = z.output<typeof mailSettingsFormSchema>;

/**
 * One provider's credential, saved on its own: every model setting that
 * chooses the provider uses it. One form per provider, told apart by id.
 */
export const modelProviderFormSchema = z.object({
	provider: z.enum(MODEL_PROVIDER_IDS as [ModelProviderId, ...ModelProviderId[]]),
	apiKey: z.string().trim().max(500),
	apiKeyChange: secretChange
});

export type ModelProviderForm = z.output<typeof modelProviderFormSchema>;

/** A model choice: Custom, or a preset that provider offers. Presets are per provider. */
function requirePresetOf(
	choice: string,
	presets: readonly { id: string }[],
	path: string,
	context: z.RefinementCtx
) {
	if (choice !== 'custom' && !presets.some((preset) => preset.id === choice)) {
		context.addIssue({
			code: 'custom',
			path: [path],
			message: 'Choose one of this provider’s models, or Custom.'
		});
	}
}

export const languageModelSettingsFormSchema = z
	.object({
		storyProvider: z.enum(LANGUAGE_PROVIDERS),
		storyModel: z.string().max(100),
		openrouterModelId: z.string().trim().max(200),
		/** A tool-calling model to research briefs with, for a story model without tools; '' for none. */
		researchModelId: z.string().trim().max(200).default('')
	})
	.superRefine((data, context) => {
		requirePresetOf(
			data.storyModel,
			STORY_MODEL_PRESETS[data.storyProvider],
			'storyModel',
			context
		);
		if (data.storyModel === 'custom' && !OPENROUTER_MODEL_ID.test(data.openrouterModelId)) {
			context.addIssue({
				code: 'custom',
				path: ['openrouterModelId'],
				message: 'An OpenRouter model ID, like vendor/model-name. Search for one above.'
			});
		}
		if (data.researchModelId !== '' && !OPENROUTER_MODEL_ID.test(data.researchModelId)) {
			context.addIssue({
				code: 'custom',
				path: ['researchModelId'],
				message: 'An OpenRouter model ID, like vendor/model-name, or nothing. Search for one above.'
			});
		}
	});

export type LanguageModelSettingsForm = z.output<typeof languageModelSettingsFormSchema>;

const baseIds = PICTURE_BASE_MODELS.map((base) => base.id);

function requirePicture(
	provider: ImageProviderId,
	choice: string,
	air: string,
	base: string,
	prefix: PictureStyle,
	context: z.RefinementCtx
) {
	requirePresetOf(choice, PICTURE_MODEL_PRESETS[provider][prefix], `${prefix}Model`, context);
	if (choice !== 'custom') {
		return;
	}
	if (!RUNWARE_MODEL_AIR.test(air)) {
		context.addIssue({
			code: 'custom',
			path: [`${prefix}RunwareModelAir`],
			message: 'A Runware model AIR, like civitai:123456@789012. Search for one above.'
		});
	}
	if (!base) {
		context.addIssue({
			code: 'custom',
			path: [`${prefix}Base`],
			message: 'Say which base model it is, so it is prompted the right way.'
		});
	}
}

export const imageModelSettingsFormSchema = z
	.object({
		photoProvider: z.enum(IMAGE_PROVIDERS),
		photoModel: z.string().max(100),
		photoRunwareModelAir: z.string().trim().max(200),
		photoBase: z.enum(['', ...baseIds]),
		illustratedProvider: z.enum(IMAGE_PROVIDERS),
		illustratedModel: z.string().max(100),
		illustratedRunwareModelAir: z.string().trim().max(200),
		illustratedBase: z.enum(['', ...baseIds])
	})
	.superRefine((data, context) => {
		requirePicture(
			data.photoProvider,
			data.photoModel,
			data.photoRunwareModelAir,
			data.photoBase,
			'photo',
			context
		);
		requirePicture(
			data.illustratedProvider,
			data.illustratedModel,
			data.illustratedRunwareModelAir,
			data.illustratedBase,
			'illustrated',
			context
		);
	});

export type ImageModelSettingsForm = z.output<typeof imageModelSettingsFormSchema>;

const VAPID_SUBJECT: RegExp = /^(?:mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/;

export const pushSettingsFormSchema = z.object({
	vapidSubject: z
		.string()
		.trim()
		.max(300)
		.refine((value) => value === '' || VAPID_SUBJECT.test(value), {
			message: 'A mailto: address or an https:// page, e.g. mailto:you@example.com'
		})
});

export type PushSettingsForm = z.output<typeof pushSettingsFormSchema>;

/** The buttons with nothing to fill in: regenerating a key, sending a test email. */
export const serverActionFormSchema = z.object({});

/**
 * The admin's override for one provider of the story model
 * (docs/server-settings.md, "Adult content by provider"). The model is not in
 * the form: the server takes it from the saved settings, and refuses a
 * provider it has no row for.
 */
export const providerOverrideFormSchema = z.object({
	provider: z.string().trim().min(1).max(120),
	override: z.enum(OVERRIDES).default('auto')
});

export type ProviderOverrideForm = z.output<typeof providerOverrideFormSchema>;

/** The most a daily cap may be set to: about $15 of speech an account a day. */
export const MAX_VOICE_DAILY_CAP = 1_000_000;

/**
 * Read aloud: the narrator's voice (a preset, or any Fish voice by its id),
 * and how much each account may have read a day.
 */
export const voiceSettingsFormSchema = z
	.object({
		voiceProvider: z.enum(VOICE_PROVIDERS),
		narratorVoice: z.string().max(100),
		fishVoiceId: z.string().trim().max(100),
		voiceDailyCap: z.number().int().min(0).max(MAX_VOICE_DAILY_CAP)
	})
	.superRefine((data, context) => {
		requirePresetOf(data.narratorVoice, FISH_VOICE_PRESETS, 'narratorVoice', context);
		if (data.narratorVoice === 'custom' && !FISH_VOICE_ID.test(data.fishVoiceId)) {
			context.addIssue({
				code: 'custom',
				path: ['fishVoiceId'],
				message:
					'A Fish Audio voice ID: the 32 letters and numbers at the end of its page’s address.'
			});
		}
	});

export type VoiceSettingsForm = z.output<typeof voiceSettingsFormSchema>;
