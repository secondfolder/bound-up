// TEMPORARY: remove once production has been migrated. See
// docs/temporary-code.md, "Server settings from the environment".
import { env as privateEnv } from '$env/dynamic/private';
import {
	OPENROUTER_MODEL_ID,
	OPENROUTER_STORY_MODEL_PRESETS,
	type PictureModelChoice,
	RUNWARE_PICTURE_MODEL_PRESETS,
	type ServerSettingKey,
	type StoryModelChoice
} from '$lib/server-settings';
import type { ServerSettingRows } from '.';

/**
 * The one-time import of settings from the environment, where they lived
 * before Admin → Server settings existed.
 *
 * A setting with no row yet takes its old variable's value, if one is set,
 * and from then on the database owns it: the variable is never read for it
 * again. That is what carries an existing deployment's `BETTER_AUTH_SECRET`
 * across — a generated one in its place would sign everyone out and stop
 * every recovery escrow working — and its mail and provider keys with it.
 *
 * Nothing but an upgrade may rely on this: the e2e suite seeds its settings
 * through the database (`e2e/global-setup.ts`).
 */

/** Each old variable, by the setting it fills. The model ones are translated below. */
const PLAIN: readonly (readonly [ServerSettingKey, string])[] = [
	['serverSecret', 'BETTER_AUTH_SECRET'],
	['vapidSubject', 'VAPID_SUBJECT'],
	['mailFrom', 'MAIL_FROM'],
	['resendApiKey', 'RESEND_API_KEY'],
	['smtpUrl', 'SMTP_URL'],
	['mailOutboxDir', 'MAIL_OUTBOX_DIR'],
	['openrouterApiKey', 'OPENROUTER_API_KEY'],
	['runwareApiKey', 'RUNWARE_AI_API_KEY'],
	// Not an old variable: where the key was put while read-aloud was built,
	// carried in the same way so it is set once and then edited here.
	['fishAudioApiKey', 'FISH_AUDIO_API_KEY']
];

/** Every variable the import reads, which the admin screen warns about while it is still set. */
export const LEGACY_ENV_VARIABLES: Readonly<Partial<Record<ServerSettingKey, readonly string[]>>> =
	{
		...Object.fromEntries(PLAIN.map(([key, name]) => [key, [name]])),
		vapidPublicKey: ['VAPID_PUBLIC_KEY'],
		vapidPrivateKey: ['VAPID_PRIVATE_KEY'],
		mailTransport: ['RESEND_API_KEY', 'SMTP_URL', 'MAIL_OUTBOX_DIR'],
		storyModel: ['DAYDREAM_MODEL'],
		photoModel: ['RUNWARE_AI_IMAGE_MODEL'],
		illustratedModel: ['RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED']
	};

/** Architectures of the models these variables have ever defaulted to, so one can be imported. */
const KNOWN_BASES: Readonly<Record<string, 'sdxl' | 'illustrious' | 'z-image-turbo'>> = {
	'persona:242173@2788849': 'z-image-turbo',
	'civitai:573152@1094291': 'sdxl',
	'aiki:827184@2883731': 'illustrious'
};

type Reader = (name: string) => string;

function reader(platform: App.Platform | undefined): Reader {
	const env = platform?.env as Record<string, unknown> | undefined;
	return (name) => {
		const value = env?.[name] ?? privateEnv[name];
		return typeof value === 'string' ? value.trim() : '';
	};
}

function storyModel(read: Reader): string | null {
	const id = read('DAYDREAM_MODEL');
	if (!id) {
		return null;
	}
	const preset = OPENROUTER_STORY_MODEL_PRESETS.find((entry) => entry.openrouterModelId === id);
	if (preset) {
		return JSON.stringify({ provider: 'openrouter', preset: preset.id } satisfies StoryModelChoice);
	}
	return OPENROUTER_MODEL_ID.test(id)
		? JSON.stringify({ provider: 'openrouter', openrouterModelId: id } satisfies StoryModelChoice)
		: null;
}

function pictureModel(read: Reader, style: 'photo' | 'illustrated'): string | null {
	const name = style === 'photo' ? 'RUNWARE_AI_IMAGE_MODEL' : 'RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED';
	const air = read(name);
	if (!air) {
		return null;
	}
	const preset = RUNWARE_PICTURE_MODEL_PRESETS[style].find(
		(entry) => entry.runwareModelAir === air
	);
	if (preset) {
		return JSON.stringify({ provider: 'runware', preset: preset.id } satisfies PictureModelChoice);
	}
	const base = KNOWN_BASES[air];
	if (!base) {
		// Its base model cannot be known without asking Runware, and a guess
		// would prompt it the wrong way. It was only ever settable for a day.
		console.warn(
			`[settings] ${name} is "${air}", which was not imported: choose it again in Admin → Server settings, with its base model.`
		);
		return null;
	}
	return JSON.stringify({
		provider: 'runware',
		runwareModelAir: air,
		base
	} satisfies PictureModelChoice);
}

/** The settings with no row whose old variable is set, and the value each should take. */
export function legacyEnvSettings(
	rows: ServerSettingRows,
	platform: App.Platform | undefined
): [ServerSettingKey, string][] {
	const read = reader(platform);
	const found: [ServerSettingKey, string][] = [];
	const missing = (key: ServerSettingKey) => rows[key] === undefined;
	const add = (key: ServerSettingKey, value: string | null) => {
		if (value && missing(key)) {
			found.push([key, value]);
		}
	};

	for (const [key, name] of PLAIN) {
		add(key, read(name));
	}
	// The pair together or not at all, as when they are generated.
	const publicKey = read('VAPID_PUBLIC_KEY');
	const privateKey = read('VAPID_PRIVATE_KEY');
	if (publicKey && privateKey && missing('vapidPublicKey') && missing('vapidPrivateKey')) {
		found.push(['vapidPublicKey', publicKey], ['vapidPrivateKey', privateKey]);
	}
	// Which transport was meant used to be which one variable was set.
	const transports = (
		[
			['resend', 'RESEND_API_KEY'],
			['smtp', 'SMTP_URL'],
			['outbox', 'MAIL_OUTBOX_DIR']
		] as const
	).filter(([, name]) => read(name));
	if (transports.length === 1) {
		add('mailTransport', transports[0]?.[0] ?? null);
	}
	add('storyModel', storyModel(read));
	add('photoModel', pictureModel(read, 'photo'));
	add('illustratedModel', pictureModel(read, 'illustrated'));
	return found;
}

/**
 * The old variables still set in this server's environment, by the setting
 * each once filled. They are ignored now; the admin screen says so, which is
 * how anyone migrating can tell when it is safe to delete them.
 */
export function legacyEnvStillSet(
	platform: App.Platform | undefined
): Partial<Record<ServerSettingKey, string[]>> {
	const read = reader(platform);
	const result: Partial<Record<ServerSettingKey, string[]>> = {};
	for (const [key, names] of Object.entries(LEGACY_ENV_VARIABLES) as [
		ServerSettingKey,
		readonly string[]
	][]) {
		const set = names.filter((name) => read(name));
		if (set.length > 0) {
			result[key] = set;
		}
	}
	return result;
}
