import {
	SERVER_SETTING_KEYS,
	type ServerSettingKey,
	type ServerSettings
} from '../server-settings';

/**
 * A server's settings for a test: every one unset (`''`) except those given.
 * What `fakeEvent` puts in `locals.settings` by default is `testSettings()`,
 * a server with nothing set up.
 */
export function testSettings(
	overrides: Partial<Record<ServerSettingKey, string>> = {}
): ServerSettings {
	const settings = {} as Record<ServerSettingKey, string>;
	for (const key of SERVER_SETTING_KEYS) {
		settings[key] = overrides[key] ?? '';
	}
	return settings;
}
