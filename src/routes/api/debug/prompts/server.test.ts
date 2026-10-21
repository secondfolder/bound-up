import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PromptView } from '$lib/prompt-review';
import type { Db } from '$lib/server/db';
import { grantFeature } from '$lib/server/features';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { load as indexLoad } from '../../../(auth-required)/(app)/debug/+page.server';
import { load as promptsLoad } from '../../../(auth-required)/(app)/debug/prompts/+page.server';
import { GET } from './+server';

/**
 * The prompt review (docs/prompt-review.md): only for an account granted
 * debug mode, one prompt or one axis's worth per request, and never a
 * combination no device could send dressed up as a prompt.
 */

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	await grantFeature(db, { userId: ada.id, feature: 'debugMode', grantedByUserId: ada.id });
});

afterEach(() => harness.close());

const get = (user: TestUser | null, query: string) =>
	runAndCatch(() => GET(fakeEvent({ db, user, path: `/api/debug/prompts?${query}` })));

async function view(query: string): Promise<unknown> {
	const result = await get(ada, query);
	if (result.type !== 'ok') {
		throw new Error(`expected a prompt, got ${JSON.stringify(result)}`);
	}
	return result.value.json();
}

describe('GET /api/debug/prompts', () => {
	it('is only for an account with debug mode', async () => {
		expect(await get(jun, 'builder=reply')).toMatchObject({ type: 'error', status: 403 });
		expect(await get(null, 'builder=reply')).toMatchObject({ type: 'error', status: 401 });
	});

	it('renders the combination asked for, through the real builder', async () => {
		const prompt = (await view('builder=reply&a.narrator=monologue&a.characters=1')) as Extract<
			PromptView,
			{ ok: true }
		>;
		expect(prompt.ok).toBe(true);
		expect(prompt.combo.narrator).toBe('monologue');
		expect(prompt.combo.heat).toBe('unset');
		expect(prompt.prompt.messages[0]?.role).toBe('system');
		expect(prompt.text).toContain('===== 1. system =====');
		expect(prompt.text).toContain('⟦character1.name⟧');
		expect(prompt.paragraphIds.length).toBeGreaterThan(10);
	});

	it('fills it with a ready-made daydream’s words when asked', async () => {
		const prompt = (await view('builder=daydream&text=one-bed')) as Extract<
			PromptView,
			{ ok: true }
		>;
		expect(prompt.text).toContain('Snowed in at a lodge');
		expect(prompt.text).not.toContain('⟦brief⟧');
	});

	it('says why no device could send a combination, rather than rendering it', async () => {
		const prompt = (await view('builder=reply&a.characters=0')) as Extract<
			PromptView,
			{ ok: false }
		>;
		expect(prompt.ok).toBe(false);
		expect(prompt.problem).toContain('someone has to speak');
	});

	it('sweeps one axis, one prompt per value', async () => {
		const { variants } = (await view('builder=daydream&sweep=side')) as {
			variants: (PromptView & { value: string })[];
		};
		expect(variants.map(({ value }) => value)).toEqual(['either', 'dom', 'sub']);
		expect(variants.every(({ ok }) => ok)).toBe(true);
	});

	it('refuses a builder or an axis it does not know', async () => {
		expect(await get(ada, 'builder=nonsense')).toMatchObject({ type: 'error', status: 400 });
		expect(await get(ada, 'builder=reply&sweep=nonsense')).toMatchObject({
			type: 'error',
			status: 400
		});
	});
});

describe('the debug pages', () => {
	it('are only for an account with debug mode', async () => {
		const forbidden = { type: 'error', status: 403 };
		expect(
			await runAndCatch(() => indexLoad(fakeEvent({ db, user: jun, path: '/debug' })))
		).toMatchObject(forbidden);
		expect(
			await runAndCatch(() => promptsLoad(fakeEvent({ db, user: jun, path: '/debug/prompts' })))
		).toMatchObject(forbidden);
	});

	it('opens a builder with its committed catalogue', async () => {
		const data = await runLoad(
			promptsLoad(fakeEvent({ db, user: ada, path: '/debug/prompts?builder=casting' }))
		);
		expect(data.builder.id).toBe('casting');
		expect(data.catalogue.builder.id).toBe('casting');
		expect(data.catalogue.paragraphs.length).toBeGreaterThan(0);
		expect(data.builders.map((builder: { id: string }) => builder.id)).toContain('reply');
	});
});
