/**
 * The OpenRouter key for the dream scripts (bench and judge): OPENROUTER_API_KEY,
 * or else the key in local.db's server settings (Admin → Server settings), so a
 * dev server's key works as-is. See docs/dreams.md, "The bench".
 */
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import {
	type AdultLevel,
	bestProviders,
	HEALTHY,
	type ProviderOverride,
	type ProviderState
} from '../src/lib/model-providers.ts';

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
 * The providers a bench run uses for `model`: the best tier local.db's
 * adult-content check found (`bestProviders`), as the app routes
 * (docs/dreams.md, "Adult-friendly providers"). Empty, so unpinned, for a
 * model never checked there.
 */
export async function bestTierProviders(model: string): Promise<string[]> {
	const listed = model.split('@')[0] ?? model;
	const db = createClient({ url: `file:${join(ROOT, 'local.db')}` });
	try {
		const result = await db.execute({
			sql: `select provider, level_passed, override, list_order,
				refusal_backoff_until, error_backoff_until
				from model_providers where model = ? and kind = 'language'`,
			args: [listed]
		});
		const at = (value: unknown) => (value === null ? null : new Date(Number(value)));
		const states: ProviderState[] = result.rows.map((row) => ({
			provider: String(row.provider),
			levelPassed: row.level_passed === null ? null : (Number(row.level_passed) as AdultLevel),
			checkedAt: null,
			override: String(row.override) as ProviderOverride,
			order: Number(row.list_order),
			health: {
				...HEALTHY,
				refusalBackoffUntil: at(row.refusal_backoff_until),
				errorBackoffUntil: at(row.error_backoff_until)
			}
		}));
		return bestProviders(states, new Date()).providers;
	} catch {
		// No local.db, or no table yet: nothing is known, so unpinned.
		return [];
	} finally {
		db.close();
	}
}
