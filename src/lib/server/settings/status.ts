import {
	PICTURE_MODEL_SETTING,
	parsePictureModel,
	parseStoryModel,
	providerCredential,
	type ServerSettings
} from '$lib/server-settings';
import { mailProblem } from '../mail/config';
import { readVapidConfig } from '../push';

/** Whether each part of the server is set up, as the admin pages summarise it. */
export type ServerSettingsStatus = {
	/** Why email cannot be sent, or null when it can. */
	mailProblem: string | null;
	/** Mail is going to the local outbox only because this is `vite dev` and nothing is set. */
	mailDevDefault: boolean;
	push: boolean;
	/** The story model's provider has a key: Daydreams can be written. */
	languageModels: boolean;
	/** Every picture model's provider has a key: Daydreams can be drawn. */
	imageModels: boolean;
};

export function serverSettingsStatus(settings: ServerSettings): ServerSettingsStatus {
	return {
		mailProblem: mailProblem(settings),
		mailDevDefault: mailProblem(settings) === null && settings.mailTransport === '',
		push: readVapidConfig(settings) !== null,
		languageModels:
			providerCredential(settings, parseStoryModel(settings.storyModel).provider) !== '',
		imageModels: (['photo', 'illustrated'] as const).every(
			(style) =>
				providerCredential(
					settings,
					parsePictureModel(style, settings[PICTURE_MODEL_SETTING[style]]).provider
				) !== ''
		)
	};
}
