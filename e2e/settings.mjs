// The server settings every e2e run writes (docs/server-settings.md), shared
// by `e2e/global-setup.ts` and, for a Workers run, `e2e/server.mjs`, which
// has to write them before the worker starts: on Workers the settings are
// cached per isolate for a minute, so ones written after its first request
// would not be seen until the cache ran out. Plain JavaScript so the .mjs
// launcher can import it on every Node the engines field allows.
//
// Every setting is written, not only the ones the suite needs. `vite dev`
// reads the developer's `.env`, and the server's one-time import from the
// environment would otherwise copy whatever is in it (a real Resend key, a
// real OpenRouter key) into this run's database, to send real email or run up
// a bill. Only the generated auth secret and push keys are left as the server
// made them.

/** The key the stand-in Resend (`e2e/model-stub.mjs`) accepts. */
export const E2E_RESEND_KEY = 'e2e-resend-key';

/**
 * @param {{ target: 'node' | 'vite' | 'image' | 'worker', outboxDir: string }} options
 * @returns {Record<string, string>}
 */
export function e2eSettings({ target, outboxDir }) {
	// Nothing is really sent. The Node builds write each email to a file (the
	// outbox); Workers cannot write files, so a Workers run sends through
	// Resend's real code path to a stand-in that writes the same files.
	// `e2e/mail.ts` reads the links back out of them either way.
	const mail =
		target === 'worker'
			? { mailTransport: 'resend', resendApiKey: E2E_RESEND_KEY, mailOutboxDir: '' }
			: { mailTransport: 'outbox', resendApiKey: '', mailOutboxDir: outboxDir };
	return {
		mailFrom: 'Bound Up <e2e@example.test>',
		...mail,
		smtpUrl: '',
		vapidSubject: 'mailto:e2e@example.test',
		// Daydreams and their pictures, against the stand-in provider
		// `e2e/server.mjs` starts (`e2e/model-stub.mjs`), which checks for exactly
		// these keys. It is reached through `OPENROUTER_BASE_URL` and
		// `RUNWARE_BASE_URL`, which stay test seams in the environment.
		openrouterApiKey: 'e2e-openrouter-key',
		storyModel: JSON.stringify({ provider: 'openrouter', openrouterModelId: 'e2e/stub' }),
		researchModel: '',
		runwareApiKey: 'e2e-runware-key',
		photoModel: JSON.stringify({ provider: 'runware', preset: 'dark-beast' }),
		illustratedModel: JSON.stringify({ provider: 'runware', preset: 'wai-illustrious' }),
		// Read aloud, against the stub's Fish Audio (`FISH_AUDIO_BASE_URL`).
		fishAudioApiKey: 'e2e-fish-audio-key',
		narratorVoice: JSON.stringify({ provider: 'fish', preset: 'breathy' }),
		voiceDailyCap: ''
	};
}

/** The statement that writes one setting, for whichever way a run reaches its database. */
export const UPSERT_SETTING = `insert into server_settings (key, value, source) values (?, ?, 'admin')
	 on conflict (key) do update set value = excluded.value, source = excluded.source`;
