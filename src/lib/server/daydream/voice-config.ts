import { env as privateEnv } from '$env/dynamic/private';
import { DEFAULT_FISH_BASE_URL } from '$lib/server/dream/fish';
import {
	FISH_VOICE_PRESETS,
	type FishVoicePresetId,
	fishVoiceIdFor,
	parseVoice,
	parseVoiceDailyCap,
	type ServerSettings
} from '$lib/server-settings';

/**
 * Where a daydream is read aloud, from the server's settings (Admin →
 * Server settings → Voices). See docs/dreams.md, "Read aloud".
 *
 * Optional, like pictures: a server without a Fish Audio key has no
 * read-aloud, and nothing else changes.
 */
export type VoiceConfig = {
	apiKey: string;
	/** Fish's API root. Only the e2e suite points it anywhere else. */
	baseUrl: string;
	/** The narrator's Fish voice. */
	narrator: string;
	/** Which preset the narrator is, so characters are given others; null for a custom voice. */
	narratorPreset: FishVoicePresetId | null;
	/** Characters (UTF-8 bytes) an account may have read aloud a day. */
	dailyCap: number;
};

export type VoiceSettings = Pick<
	ServerSettings,
	'fishAudioApiKey' | 'narratorVoice' | 'voiceDailyCap'
>;

const TRAILING_SLASHES = /\/+$/;
const HTTP_URL = /^https?:\/\//;

/**
 * Fish's API root: `FISH_AUDIO_BASE_URL` if set, which only the e2e suite
 * does. A test seam, like `OPENROUTER_BASE_URL`, not a setting.
 */
export function fishBaseUrl(platform: App.Platform | undefined): string {
	const given = platform?.env?.FISH_AUDIO_BASE_URL ?? privateEnv.FISH_AUDIO_BASE_URL;
	const baseUrl = (given?.trim() || DEFAULT_FISH_BASE_URL).replace(TRAILING_SLASHES, '');
	if (!HTTP_URL.test(baseUrl)) {
		throw new Error(
			`FISH_AUDIO_BASE_URL must be an http(s) URL, such as ${DEFAULT_FISH_BASE_URL}; it is "${baseUrl}". Unset it to use Fish Audio itself.`
		);
	}
	return baseUrl;
}

/** Null when Fish Audio has no key, which turns read-aloud off on this server. */
export function parseVoiceConfig(settings: VoiceSettings, baseUrl: string): VoiceConfig | null {
	const apiKey = settings.fishAudioApiKey.trim();
	if (!apiKey) {
		return null;
	}
	const choice = parseVoice(settings.narratorVoice);
	return {
		apiKey,
		baseUrl,
		narrator: fishVoiceIdFor(choice),
		narratorPreset: 'preset' in choice ? choice.preset : null,
		dailyCap: parseVoiceDailyCap(settings.voiceDailyCap)
	};
}

export function readVoiceConfig(
	settings: VoiceSettings,
	platform: App.Platform | undefined
): VoiceConfig | null {
	return parseVoiceConfig(settings, fishBaseUrl(platform));
}

/** The Fish voice a request names: the narrator, or a curated voice; null for anything else. */
export function fishVoiceFor(config: VoiceConfig, name: string): string | null {
	if (name === 'narrator') {
		return config.narrator;
	}
	return FISH_VOICE_PRESETS.find((preset) => preset.id === name)?.fishVoiceId ?? null;
}
