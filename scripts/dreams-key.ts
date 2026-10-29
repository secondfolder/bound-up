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
