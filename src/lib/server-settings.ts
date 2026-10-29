/**
 * Server settings, the pure half: which settings there are, the model
 * presets, and how a stored choice turns into the model a request is sent to.
 * See docs/server-settings.md.
 *
 * Alias-free, like `types.ts`: the Drizzle schema imports its types, and the
 * admin screen shares the presets with the server.
 */

import type { PictureStyle } from './daydream';
import type { PictureArchitecture } from './daydream/image-prompt';

/**
 * Every setting the admin screen owns. A row that is missing has never been
 * set; a row holding `''` was cleared on purpose, which is what stops the
 * one-time import from the environment bringing it back.
 */
export const SERVER_SETTING_KEYS = [
	'serverSecret',
	'vapidPublicKey',
	'vapidPrivateKey',
	'vapidSubject',
	'mailFrom',
	'mailTransport',
	'resendApiKey',
	'smtpUrl',
	'mailOutboxDir',
	'openrouterApiKey',
	'runwareApiKey',
	'storyModel',
	'researchModel',
	'photoModel',
	'illustratedModel'
] as const;

export type ServerSettingKey = (typeof SERVER_SETTING_KEYS)[number];

/** Every setting's value, `''` for one that is not set. */
export type ServerSettings = Readonly<Record<ServerSettingKey, string>>;

/** Where a stored value came from, which the admin screen says beside it. */
export type ServerSettingSource = 'generated' | 'imported' | 'admin';

/**
 * Settings whose value is a credential. Their values never reach the browser:
 * the admin screen is told only whether one is set and how it ends.
 */
export const SECRET_SETTING_KEYS: ReadonlySet<ServerSettingKey> = new Set([
	'serverSecret',
	'vapidPrivateKey',
	'resendApiKey',
	'smtpUrl',
	'openrouterApiKey',
	'runwareApiKey'
]);

export type MailTransportKind = 'resend' | 'smtp' | 'outbox';

export const MAIL_TRANSPORTS: readonly MailTransportKind[] = ['resend', 'smtp', 'outbox'];

export function isMailTransport(value: string): value is MailTransportKind {
	return (MAIL_TRANSPORTS as readonly string[]).includes(value);
}

// ── model providers ──────────────────────────────────────────────────────────

/**
 * The services models are run on, and the one credential each needs. A
 * provider's key is set once, on its own, and every model setting that
 * chooses the provider uses it: the key belongs to the account with the
 * provider, not to any one model. See docs/server-settings.md, "Model
 * providers".
 */
export const MODEL_PROVIDERS = {
	openrouter: {
		label: 'OpenRouter',
		credentialKey: 'openrouterApiKey',
		keyLabel: 'OpenRouter API key',
		keyHint: 'From openrouter.ai → Keys. Setting a credit limit on it is a good idea.',
		keyPlaceholder: 'sk-or-…'
	},
	runware: {
		label: 'Runware',
		credentialKey: 'runwareApiKey',
		keyLabel: 'Runware API key',
		keyHint: 'From runware.ai → API Keys. Searching for a custom model needs it saved first.',
		keyPlaceholder: null
	}
} as const satisfies Record<
	string,
	{
		label: string;
		credentialKey: ServerSettingKey;
		keyLabel: string;
		keyHint: string;
		keyPlaceholder: string | null;
	}
>;

export type ModelProviderId = keyof typeof MODEL_PROVIDERS;

export const MODEL_PROVIDER_IDS = Object.keys(MODEL_PROVIDERS) as ModelProviderId[];

/**
 * The providers a model of each kind can be chosen from. Lists rather than a
 * kind on each provider, so a provider that runs both is simply in both.
 */
export const LANGUAGE_PROVIDERS = ['openrouter'] as const satisfies readonly ModelProviderId[];
export const IMAGE_PROVIDERS = ['runware'] as const satisfies readonly ModelProviderId[];

export type LanguageProviderId = (typeof LANGUAGE_PROVIDERS)[number];
export type ImageProviderId = (typeof IMAGE_PROVIDERS)[number];

export type ModelKind = 'language' | 'image';

/** What a provider runs, for the providers card. */
export function modelKindsOf(provider: ModelProviderId): ModelKind[] {
	const kinds: ModelKind[] = [];
	if ((LANGUAGE_PROVIDERS as readonly string[]).includes(provider)) {
		kinds.push('language');
	}
	if ((IMAGE_PROVIDERS as readonly string[]).includes(provider)) {
		kinds.push('image');
	}
	return kinds;
}

export function isModelProvider(value: unknown): value is ModelProviderId {
	return typeof value === 'string' && Object.hasOwn(MODEL_PROVIDERS, value);
}

/** The settings that hold a provider's credential. */
export type ProviderCredentialKey = (typeof MODEL_PROVIDERS)[ModelProviderId]['credentialKey'];

/** A provider's key, trimmed, or `''` when it has none. */
export function providerCredential(
	settings: Pick<ServerSettings, ProviderCredentialKey>,
	provider: ModelProviderId
): string {
	return settings[MODEL_PROVIDERS[provider].credentialKey].trim();
}

// ── story model (OpenRouter) ─────────────────────────────────────────────────

/**
 * The story models offered by name. A preset is named for a family, not a
 * version: what is stored is the preset's id, so moving `openrouterModelId` to
 * a newer release here moves every server that chose it.
 *
 * Every one is an open-weights model whose terms, and whose providers' terms
 * on OpenRouter, allow adult fiction. Most hosted models' do not, which is why
 * the choice is not left to OpenRouter's router.
 */
export const OPENROUTER_STORY_MODEL_PRESETS = [
	{
		id: 'hermes',
		label: 'Hermes',
		description: 'Nous Research’s Llama fine-tune. Follows the story’s rules closely.',
		openrouterModelId: 'nousresearch/hermes-3-llama-3.1-70b'
	},
	{
		id: 'hermes-large',
		label: 'Hermes, large',
		description: 'The biggest Hermes. Richer writing, at about three times the price.',
		openrouterModelId: 'nousresearch/hermes-4-405b'
	},
	{
		id: 'euryale',
		label: 'Euryale',
		description: 'A Llama fine-tune made for roleplay and fiction.',
		openrouterModelId: 'sao10k/l3.1-euryale-70b'
	},
	{
		id: 'cydonia',
		label: 'Cydonia',
		description: 'A small roleplay model. The cheapest and fastest here.',
		openrouterModelId: 'thedrummer/cydonia-24b-v4.1'
	}
] as const;

export type OpenRouterStoryModelPresetId = (typeof OPENROUTER_STORY_MODEL_PRESETS)[number]['id'];

/** The story presets on offer from each provider. */
export const STORY_MODEL_PRESETS = {
	openrouter: OPENROUTER_STORY_MODEL_PRESETS
} as const satisfies Record<LanguageProviderId, readonly { id: string }[]>;

/**
 * What `storyModel` holds, as JSON: the provider, then a preset of its or a
 * custom id in its own terms.
 */
export type StoryModelChoice = { provider: 'openrouter' } & (
	| { preset: OpenRouterStoryModelPresetId }
	| {
			openrouterModelId: string;
			/**
			 * Whether OpenRouter lists the model as calling tools, looked up when it
			 * was saved; what lets a brief's links be read (docs/daydreams.md,
			 * "Links in a brief"). Absent for a choice saved before it was asked,
			 * which is read as no. None of the presets do.
			 */
			tools?: boolean;
	  }
);

export const DEFAULT_STORY_MODEL: StoryModelChoice = { provider: 'openrouter', preset: 'hermes' };

/**
 * An OpenRouter model id: `vendor/model`, optionally with a `:variant`, and
 * optionally an `@` suffix, which may itself have slashes in it — a preset,
 * `z-ai/glm-5.2@preset/nsfw-compatible`, routes through one of the account's
 * provider presets.
 */
export const OPENROUTER_MODEL_ID: RegExp =
	/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*(?:@[a-z0-9][a-z0-9._:/-]*)?$/i;

// ── picture models (Runware) ─────────────────────────────────────────────────

/**
 * What a picture model was trained from, which decides how it is prompted:
 * each maps to one of `image-prompt.ts`'s recipes. Kept finer than the
 * recipes so the stored choice says what the model is, and a recipe can be
 * split for one family later without asking anyone again.
 */
export const PICTURE_BASE_MODELS = [
	{ id: 'sdxl', label: 'SDXL', architecture: 'sdxl' },
	{ id: 'illustrious', label: 'Illustrious (SDXL)', architecture: 'sdxl' },
	{ id: 'pony', label: 'Pony (SDXL)', architecture: 'sdxl' },
	{ id: 'noobai', label: 'NoobAI (SDXL)', architecture: 'sdxl' },
	{ id: 'z-image-turbo', label: 'Z-Image Turbo', architecture: 'z-image-turbo' },
	{ id: 'flux-2-klein', label: 'FLUX.2 Klein', architecture: 'flux-2' }
] as const satisfies readonly { id: string; label: string; architecture: PictureArchitecture }[];

export type PictureBaseModel = (typeof PICTURE_BASE_MODELS)[number]['id'];

export function isPictureBaseModel(value: string): value is PictureBaseModel {
	return PICTURE_BASE_MODELS.some((base) => base.id === value);
}

/**
 * Ours, for the `architecture` Runware's `modelSearch` reports, or null for a
 * family no recipe here suits. Only a suggestion: the admin screen fills the
 * base model in with it, and the admin can change it.
 */
export function pictureBaseModelForRunware(runware: string): PictureBaseModel | null {
	if (runware.startsWith('z_image')) {
		return 'z-image-turbo';
	}
	// `flux2klein_9b` and `flux2klein_4b`, the distilled models. Not the
	// `flux2klein_base_*` ones: undistilled, they want ~28 steps, not 4.
	if (runware.startsWith('flux2klein') && !runware.startsWith('flux2klein_base')) {
		return 'flux-2-klein';
	}
	if (
		runware === 'sdxl' ||
		runware === 'illustrious' ||
		runware === 'pony' ||
		runware === 'noobai'
	) {
		return runware;
	}
	return null;
}

type PicturePreset = {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	/**
	 * A Runware AIR, pinned to a version, so an upload to the model's page
	 * cannot change what the app draws. Moving a preset to a newer version is
	 * a change here, not a setting.
	 */
	readonly runwareModelAir: string;
	readonly base: PictureBaseModel;
};

/**
 * The picture models offered by name, per style.
 *
 * - Dark Beast: a Z-Image Turbo fine-tune for adult imagery (chosen
 *   2026-10-20). Against LUSTIFY! it follows a long description far more
 *   closely — who is where, how many people — and looks less waxy. It draws
 *   only photographs: asked for an illustration, it still made one.
 * - FLUX.2 Klein 9B, Black Forest Labs' distilled model as Runware hosts it
 *   (added 2026-10-20): a hand-tuned prompt for it made pictures that were
 *   good, and it draws quoted text legibly. Runware lists it for commercial
 *   use; BFL publish the 9B weights under their non-commercial licence, which
 *   binds anyone running them elsewhere.
 * - WAI Illustrious v17.0, as a Runware user mirrored it; Civitai's own
 *   namespace on Runware does not have it.
 */
export const RUNWARE_PICTURE_MODEL_PRESETS = {
	photo: [
		{
			id: 'dark-beast',
			label: 'Dark Beast',
			description: 'A Z-Image Turbo fine-tune. Follows long descriptions closely.',
			runwareModelAir: 'persona:242173@2788849',
			base: 'z-image-turbo'
		},
		{
			id: 'lustify',
			label: 'LUSTIFY!',
			description: 'An SDXL checkpoint. Looser with the description, softer skin.',
			runwareModelAir: 'civitai:573152@1094291',
			base: 'sdxl'
		},
		{
			id: 'flux-2-klein-9b',
			label: 'FLUX.2 Klein 9B',
			description: 'Black Forest Labs, distilled to 4 steps. Fast, and draws quoted text.',
			runwareModelAir: 'runware:400@2',
			base: 'flux-2-klein'
		}
	],
	illustrated: [
		{
			id: 'wai-illustrious',
			label: 'WAI Illustrious',
			description: 'An Illustrious checkpoint for semi-realistic illustration.',
			runwareModelAir: 'aiki:827184@2883731',
			base: 'illustrious'
		}
	]
} as const satisfies Record<PictureStyle, readonly PicturePreset[]>;

/** The picture presets on offer from each provider, per style. */
export const PICTURE_MODEL_PRESETS = {
	runware: RUNWARE_PICTURE_MODEL_PRESETS
} as const satisfies Record<ImageProviderId, Record<PictureStyle, readonly { id: string }[]>>;

/**
 * What `photoModel` and `illustratedModel` hold, as JSON: the provider, then
 * a preset of its or a custom model in its own terms.
 */
export type PictureModelChoice = { provider: 'runware' } & (
	| { preset: string }
	| { runwareModelAir: string; base: PictureBaseModel }
);

export const DEFAULT_PICTURE_MODELS: Readonly<Record<PictureStyle, PictureModelChoice>> = {
	photo: { provider: 'runware', preset: 'dark-beast' },
	illustrated: { provider: 'runware', preset: 'wai-illustrious' }
};

/** The setting that holds each style's model. */
export const PICTURE_MODEL_SETTING = {
	photo: 'photoModel',
	illustrated: 'illustratedModel'
} as const satisfies Record<PictureStyle, ServerSettingKey>;

/**
 * A Runware AIR: `source:model@version`, e.g. `civitai:573152@1094291`. The
 * version is not always a number (`…@2788849L` is one), so it takes letters too.
 */
export const RUNWARE_MODEL_AIR: RegExp = /^[a-z0-9_-]+:[a-z0-9_-]+@[a-z0-9_.-]+$/i;

// ── reading a stored choice ──────────────────────────────────────────────────

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * The provider a stored choice names. One without any is read as the kind's
 * first provider, which every choice was before there was a choice of them;
 * one this build does not know is null, and the choice reads as the default.
 */
function providerOf<P extends string>(
	value: Record<string, unknown>,
	known: readonly P[]
): P | null {
	if (value.provider === undefined) {
		return known[0] ?? null;
	}
	return known.find((id) => id === value.provider) ?? null;
}

/**
 * A stored story model choice, or the default for one that is unset or not
 * one this build understands — a preset since removed, or a provider, say.
 * Never throws: a bad row must not take Daydreams down with it.
 */
export function parseStoryModel(raw: string): StoryModelChoice {
	const value = parseJson(raw);
	if (isRecord(value) && providerOf(value, LANGUAGE_PROVIDERS) === 'openrouter') {
		const { preset, openrouterModelId } = value;
		if (OPENROUTER_STORY_MODEL_PRESETS.some((entry) => entry.id === preset)) {
			return { provider: 'openrouter', preset: preset as OpenRouterStoryModelPresetId };
		}
		if (typeof openrouterModelId === 'string' && OPENROUTER_MODEL_ID.test(openrouterModelId)) {
			return value.tools === true
				? { provider: 'openrouter', openrouterModelId, tools: true }
				: { provider: 'openrouter', openrouterModelId };
		}
	}
	return DEFAULT_STORY_MODEL;
}

/**
 * The research model, for a story model that cannot call tools: an OpenRouter
 * model id, stored as it is, or null when none is set (or the stored value is
 * not an id). It only ever reads a brief's links and searches for it, and is
 * checked to call tools when it is saved (docs/dreams.md, "Research").
 */
export function parseResearchModel(raw: string): string | null {
	const id = raw.trim();
	return OPENROUTER_MODEL_ID.test(id) ? id : null;
}

/** Whether a choice's model can call tools: only a custom one OpenRouter said could. */
export function storyModelCallsTools(choice: StoryModelChoice): boolean {
	return 'openrouterModelId' in choice && choice.tools === true;
}

/** The OpenRouter model id a choice is sent to. */
export function openrouterModelIdFor(choice: StoryModelChoice): string {
	if ('openrouterModelId' in choice) {
		return choice.openrouterModelId;
	}
	const preset = OPENROUTER_STORY_MODEL_PRESETS.find((entry) => entry.id === choice.preset);
	return (preset ?? OPENROUTER_STORY_MODEL_PRESETS[0]).openrouterModelId;
}

/** A stored picture model choice for a style, or that style's default; as above, never throws. */
export function parsePictureModel(style: PictureStyle, raw: string): PictureModelChoice {
	const value = parseJson(raw);
	if (isRecord(value) && providerOf(value, IMAGE_PROVIDERS) === 'runware') {
		const { preset, runwareModelAir, base } = value;
		if (RUNWARE_PICTURE_MODEL_PRESETS[style].some((entry) => entry.id === preset)) {
			return { provider: 'runware', preset: preset as string };
		}
		if (
			typeof runwareModelAir === 'string' &&
			RUNWARE_MODEL_AIR.test(runwareModelAir) &&
			typeof base === 'string' &&
			isPictureBaseModel(base)
		) {
			return { provider: 'runware', runwareModelAir, base };
		}
	}
	return DEFAULT_PICTURE_MODELS[style];
}

/** A Runware model and how it is prompted. */
export type RunwarePictureModel = {
	runwareModelAir: string;
	base: PictureBaseModel;
	architecture: PictureArchitecture;
};

/** The model a style's choice draws with, and the recipe its base model calls for. */
export function runwarePictureModelFor(
	style: PictureStyle,
	choice: PictureModelChoice
): RunwarePictureModel {
	let picked: { runwareModelAir: string; base: PictureBaseModel };
	if ('runwareModelAir' in choice) {
		picked = { runwareModelAir: choice.runwareModelAir, base: choice.base };
	} else {
		const presets: readonly PicturePreset[] = RUNWARE_PICTURE_MODEL_PRESETS[style];
		picked = presets.find((entry) => entry.id === choice.preset) ?? (presets[0] as PicturePreset);
	}
	const base = PICTURE_BASE_MODELS.find((entry) => entry.id === picked.base);
	return {
		runwareModelAir: picked.runwareModelAir,
		base: picked.base,
		architecture: base?.architecture ?? 'sdxl'
	};
}

/**
 * The last few characters of a credential, which is all the admin screen is
 * ever shown of one: enough to tell two keys apart, nowhere near enough to
 * use one.
 */
export function secretTail(value: string): string {
	return value.length > 12 ? value.slice(-4) : '';
}
