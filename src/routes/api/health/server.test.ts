import { describe, expect, it, vi } from 'vitest';
import { createTestDb } from '$lib/testing/db';
import { fakeEvent } from '$lib/testing/events';
import { GET } from './+server';

describe('GET /api/health', () => {
	it('is ok while the database answers', async () => {
		const harness = await createTestDb();
		try {
			const response = await GET(fakeEvent({ db: harness.db }));
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual({ ok: true });
		} finally {
			harness.close();
		}
	});

	// What turns a container unhealthy: the process is up but its volume is not.
	it('is 503 when the database does not answer', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const harness = await createTestDb();
		harness.close();
		const response = await GET(fakeEvent({ db: harness.db }));
		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({ ok: false });
		error.mockRestore();
	});
});
