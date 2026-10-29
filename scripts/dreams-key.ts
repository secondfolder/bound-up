/**
 * The OpenRouter key for the dream scripts (bench and judge): OPENROUTER_API_KEY,
 * or else the key in local.db's server settings (Admin → Server settings), so a
 * dev server's key works as-is. See docs/dreams.md, "The bench".
 */
import { join } from 'node:path';
import { createClient } from '@libsql/client';

export const ROOT = new URL('../', import.meta.url).pathname;

export async function apiKey(): Promise<string> {
	if (process.env.OPENROUTER_API_KEY) {
		return process.env.OPENROUTER_API_KEY;
	}
	const db = createClient({ url: `file:${join(ROOT, 'local.db')}` });
	try {
		const result = await db.execute({
			sql: 'select value from server_settings where key = ?',
			args: ['openrouterApiKey']
		});
		const value = result.rows[0]?.value;
		if (typeof value === 'string' && value) {
			return value;
		}
	} catch {
		// No local.db, or no settings table yet: fall through to the message below.
	} finally {
		db.close();
	}
	throw new Error(
		'No OpenRouter key: set OPENROUTER_API_KEY, or set one in Admin → Server settings on a dev server (local.db).'
	);
}

/**
 * The providers a bench run may use for `model`: only those local.db's
 * adult-content check found to allow everything (the highest level), or that
 * the admin always allows, cheapest first, as the app routes
 * (docs/dreams.md, "Adult-friendly providers"). Throws when there are none,
 * rather than sending anything to a provider that may refuse or filter.
 */
export async function fullAdultProviders(model: string, level: number): Promise<string[]> {
	const listed = model.split('@')[0] ?? model;
	const db = createClient({ url: `file:${join(ROOT, 'local.db')}` });
	let providers: string[] = [];
	try {
		const result = await db.execute({
			sql: `select provider from model_providers
				where model = ? and kind = 'language' and override != 'never'
				and (override = 'always' or level_passed >= ?)
				order by list_order, provider`,
			args: [listed, level]
		});
		providers = result.rows.map((row) => String(row.provider));
	} catch {
		// No local.db, or no table yet: no provider is known to pass.
	} finally {
		db.close();
	}
	if (providers.length === 0) {
		throw new Error(
			`No provider for ${listed} has passed full adult support in local.db. Make it the story model on a dev server and press "Check adult content" under Admin → Server settings → Language models.`
		);
	}
	return providers;
}
