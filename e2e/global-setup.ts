import { sql } from './db';
import { E2E_CONTAINER_MAIL_DIR, E2E_MAIL_DIR } from './run-paths';

/**
 * Sets this run's server settings (docs/server-settings.md), straight into
 * its database.
 *
 * A globalSetup can do this where it could not rebuild the database (see
 * `webServer` in playwright.config.ts): it runs after the server has started,
 * and the settings are read on every request by the local backends, so they
 * apply from the first test on.
 *
 * Every setting is written, not only the ones the suite needs. `vite dev`
 * reads the developer's `.env`, and the server's one-time import from the
 * environment would otherwise copy whatever is in it — a real Resend key, a
 * real OpenRouter key — into this run's database, to send real email or run
 * up a bill. Only the generated auth secret and push keys are left as the
 * server made them.
 */
const SETTINGS: Record<string, string> = {
	// Nothing is sent: the outbox writes each email to a file, and `e2e/mail.ts`
	// reads the links back out of it. Inside the image it is a path of its own.
	mailFrom: 'Bound Up <e2e@example.test>',
	mailTransport: 'outbox',
	mailOutboxDir: process.env.E2E_IMAGE ? E2E_CONTAINER_MAIL_DIR : E2E_MAIL_DIR,
	resendApiKey: '',
	smtpUrl: '',
	vapidSubject: 'mailto:e2e@example.test',
	// Daydreams and their pictures, against the stand-in provider
	// `e2e/server.mjs` starts (`e2e/model-stub.mjs`), which checks for exactly
	// these keys. It is reached through `OPENROUTER_BASE_URL` and
	// `RUNWARE_BASE_URL`, which stay test seams in the environment.
	openrouterApiKey: 'e2e-openrouter-key',
	storyModel: JSON.stringify({ provider: 'openrouter', openrouterModelId: 'e2e/stub' }),
	runwareApiKey: 'e2e-runware-key',
	photoModel: JSON.stringify({ provider: 'runware', preset: 'dark-beast' }),
	illustratedModel: JSON.stringify({ provider: 'runware', preset: 'wai-illustrious' })
};

// biome-ignore lint/style/noDefaultExport: Playwright loads a globalSetup by its default export.
export default async function globalSetup() {
	for (const [key, value] of Object.entries(SETTINGS)) {
		await sql(
			`insert into server_settings (key, value, source) values (?, ?, 'admin')
			 on conflict (key) do update set value = excluded.value, source = excluded.source`,
			[key, value]
		);
	}
}
