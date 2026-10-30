import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capture } from './dream-capture';

vi.mock('$app/environment', () => ({ dev: true }));

let root = '';

afterEach(async () => {
	if (root) {
		await rm(root, { recursive: true, force: true });
	}
});

describe('capture', () => {
	it('writes each request in development, readable, and never its key', async () => {
		root = await mkdtemp(join(tmpdir(), 'dream-log-'));
		await capture(
			{
				step: 'passage',
				request: {
					model: 'z-ai/glm-5.2',
					apiKey: 'sk-or-secret',
					messages: [
						{ role: 'system', content: 'You write daydreams.' },
						{ role: 'user', content: 'I wait.' }
					]
				},
				reply: 'She smiles.',
				thinking: 'Slow it down.',
				provider: 'Wafer',
				usage: { promptTokens: 10, cachedTokens: 8 }
			},
			root
		);
		const [day] = await readdir(root);
		const [file] = await readdir(join(root, day ?? ''));
		expect(file).toMatch(/-passage\.md$/);
		const text = await readFile(join(root, day ?? '', file ?? ''), 'utf8');
		expect(text).toContain('## system');
		expect(text).toContain('I wait.');
		expect(text).toContain('## Thinking');
		expect(text).toContain('She smiles.');
		expect(text).toContain('Provider: Wafer');
		expect(text).not.toContain('sk-or-secret');
	});
});
