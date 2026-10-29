import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderState } from '$lib/model-providers';
import type { Db } from '$lib/server/db';
import { loadProviderStates } from '$lib/server/model-providers/store';
import { loadServerSettings, saveServerSettings } from '$lib/server/settings';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runLoad } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

/**
 * The story model's adult-content check on Admin → Server settings
 * (docs/server-settings.md, "Adult content by provider"), against a stand-in
 * OpenRouter with one provider that allows everything and one that refuses.
 */

let harness: TestDb;
let db: Db;
let admin: TestUser;
const PROSE =
	'They close the door behind them, and the rest of the evening is theirs alone, slowly.';

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	admin = await createTestUser(db, { name: 'Admin', role: 'admin' });
	env.OPENROUTER_BASE_URL = `https://models-${crypto.randomUUID()}.test/v1`;
	await saveServerSettings(db, {
		storyModel: JSON.stringify({
			provider: 'openrouter',
			openrouterModelId: 'z-ai/glm-5.2@preset/nsfw'
		})
	});
	vi.stubGlobal(
		'fetch',
		vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith('/models/z-ai/glm-5.2/endpoints')) {
				return Promise.resolve(
					Response.json({ data: { endpoints: [{ tag: 'open/fp8' }, { tag: 'prude/fp4' }] } })
				);
			}
			const body = JSON.parse(String(init?.body ?? '{}')) as { provider?: { order?: string[] } };
			const prude = body.provider?.order?.[0] === 'prude/fp4';
			return Promise.resolve(
				Response.json({
					provider: body.provider?.order?.[0],
					choices: [
						{ message: { content: prude ? "I'm sorry, I can't." : PROSE }, finish_reason: 'stop' }
					]
				})
			);
		})
	);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
});

async function event(formData?: Record<string, string>) {
	const settings = await loadServerSettings(db, undefined);
	return fakeEvent({
		db,
		user: admin,
		path: '/admin/server',
		settings,
		...(formData ? { formData } : {})
	});
}

const KEY = { model: 'z-ai/glm-5.2', kind: 'language' as const };

describe('checking the story model’s providers', () => {
	it('says to add a key first, and asks nobody without one', async () => {
		const result = await runAction(actions, 'checkProviders', await event({}));
		expect(JSON.stringify(result)).toContain('Add an OpenRouter key');
		expect(await loadProviderStates(db, KEY)).toEqual([]);
	});

	it('stores what each provider passed, under the model as listed, and shows it', async () => {
		await saveServerSettings(db, { openrouterApiKey: 'sk-test' });
		const result = await runAction(actions, 'checkProviders', await event({}));
		expect(JSON.stringify(result)).toContain('Checked 2 providers: 1 allow adult content.');
		const data = await runLoad(load(await event()));
		expect(data.storyModelListed).toBe('z-ai/glm-5.2');
		expect(
			data.storyProviders.map((state: ProviderState) => [state.provider, state.levelPassed])
		).toEqual([
			['open/fp8', 4],
			['prude/fp4', 0]
		]);
	});

	it('saves an override only for a provider the model was checked on', async () => {
		await saveServerSettings(db, { openrouterApiKey: 'sk-test' });
		await runAction(actions, 'checkProviders', await event({}));
		await runAction(
			actions,
			'setProviderOverride',
			await event({ provider: 'prude/fp4', override: 'always' })
		);
		const states = await loadProviderStates(db, KEY);
		expect(states.find((state) => state.provider === 'prude/fp4')?.override).toBe('always');

		const refused = await runAction(
			actions,
			'setProviderOverride',
			await event({ provider: 'made-up/fp8', override: 'always' })
		);
		expect(JSON.stringify(refused)).toContain('Run the check first');
		expect(await loadProviderStates(db, KEY)).toHaveLength(2);
	});
});
