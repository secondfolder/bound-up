import { z } from 'zod';
import {
	OPENROUTER_MODEL_ID,
	OPENROUTER_STORY_MODEL_PRESETS,
	PICTURE_BASE_MODELS,
	RUNWARE_MODEL_AIR,
	RUNWARE_PICTURE_MODEL_PRESETS
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

const storyPresetIds = OPENROUTER_STORY_MODEL_PRESETS.map((preset) => preset.id);

export const languageModelSettingsFormSchema = z
	.object({
		openrouterApiKey: z.string().trim().max(500),
		openrouterApiKeyChange: secretChange,
		storyModel: z.enum(['custom', ...storyPresetIds] as const),
		openrouterModelId: z.string().trim().max(200)
	})
	.superRefine((data, context) => {
		if (data.storyModel === 'custom' && !OPENROUTER_MODEL_ID.test(data.openrouterModelId)) {
			context.addIssue({
				code: 'custom',
				path: ['openrouterModelId'],
				message: 'An OpenRouter model ID, like vendor/model-name. Search for one above.'
			});
		}
	});

export type LanguageModelSettingsForm = z.output<typeof languageModelSettingsFormSchema>;

const baseIds = PICTURE_BASE_MODELS.map((base) => base.id);
const photoPresetIds = RUNWARE_PICTURE_MODEL_PRESETS.photo.map((preset) => preset.id);
const illustratedPresetIds = RUNWARE_PICTURE_MODEL_PRESETS.illustrated.map((preset) => preset.id);

function requireCustomPicture(
	choice: string,
	air: string,
	base: string,
	prefix: 'photo' | 'illustrated',
	context: z.RefinementCtx
) {
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
		runwareApiKey: z.string().trim().max(500),
		runwareApiKeyChange: secretChange,
		photoModel: z.enum(['custom', ...photoPresetIds] as const),
		photoRunwareModelAir: z.string().trim().max(200),
		photoBase: z.enum(['', ...baseIds]),
		illustratedModel: z.enum(['custom', ...illustratedPresetIds] as const),
		illustratedRunwareModelAir: z.string().trim().max(200),
		illustratedBase: z.enum(['', ...baseIds])
	})
	.superRefine((data, context) => {
		requireCustomPicture(
			data.photoModel,
			data.photoRunwareModelAir,
			data.photoBase,
			'photo',
			context
		);
		requireCustomPicture(
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
