import type { ServerSettings } from '$lib/server-settings';
import { mailProblem } from '../mail/config';
import { readVapidConfig } from '../push';

/** Whether each part of the server is set up, as the admin pages summarise it. */
export type ServerSettingsStatus = {
	/** Why email cannot be sent, or null when it can. */
	mailProblem: string | null;
	/** Mail is going to the local outbox only because this is `vite dev` and nothing is set. */
	mailDevDefault: boolean;
	push: boolean;
	/** An OpenRouter key: chat models are available, which Daydreams need. */
	languageModels: boolean;
	/** A Runware key: image models are available, which Daydreams draw pictures with. */
	imageModels: boolean;
};

export function serverSettingsStatus(settings: ServerSettings): ServerSettingsStatus {
	return {
		mailProblem: mailProblem(settings),
		mailDevDefault: mailProblem(settings) === null && settings.mailTransport === '',
		push: readVapidConfig(settings) !== null,
		languageModels: settings.openrouterApiKey.trim() !== '',
		imageModels: settings.runwareApiKey.trim() !== ''
	};
}
