import { sql } from './db';
import { E2E_CONTAINER_MAIL_DIR, E2E_MAIL_DIR, e2eTarget } from './run-paths';
import { e2eSettings, UPSERT_SETTING } from './settings.mjs';

/**
 * Sets this run's server settings (docs/server-settings.md), straight into
 * its database. What they are, and why every one is written, is in
 * `e2e/settings.mjs`.
 *
 * A globalSetup can do this where it could not rebuild the database (see
 * `webServer` in playwright.config.ts): it runs after the server has started,
 * and the local backends read the settings on every request, so they apply
 * from the first test on. A Workers run caches them, so `e2e/server.mjs`
 * writes them before the worker starts as well; writing them again here
 * changes nothing.
 */
// biome-ignore lint/style/noDefaultExport: Playwright loads a globalSetup by its default export.
export default async function globalSetup() {
	const target = e2eTarget();
	const settings = e2eSettings({
		target,
		outboxDir: target === 'image' ? E2E_CONTAINER_MAIL_DIR : E2E_MAIL_DIR
	});
	for (const [key, value] of Object.entries(settings)) {
		await sql(UPSERT_SETTING, [key, value]);
	}
}
