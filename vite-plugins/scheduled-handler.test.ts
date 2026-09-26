import { describe, expect, it } from 'vitest';
import { appendScheduledHandler, SCHEDULED_MARKER } from './scheduled-handler';

// The tail of what @sveltejs/adapter-cloudflare generates, trimmed.
const WORKER = `var worker_default = {
  async fetch(req, env2, ctx) {
    return new Response('ok');
  }
};
export {
  worker_default as default
};
`;

describe('appendScheduledHandler', () => {
	it('attaches the handler to the default export object', () => {
		const out = appendScheduledHandler(WORKER, '../../src/lib/server/scheduled.ts');
		expect(out.startsWith(WORKER)).toBe(true);
		expect(out).toContain(SCHEDULED_MARKER);
		expect(out).toContain(
			"import { scheduled as __scheduled } from '../../src/lib/server/scheduled.ts';"
		);
		expect(out).toContain('worker_default.scheduled = __scheduled;');
	});

	it('is idempotent, so a rebuild does not attach it twice', () => {
		const once = appendScheduledHandler(WORKER, './a.ts');
		expect(appendScheduledHandler(once, './a.ts')).toBe(once);
	});

	it('fails the build when the adapter output no longer has the binding', () => {
		expect(() => appendScheduledHandler('export default { fetch() {} };', './a.ts')).toThrow(
			/worker_default/
		);
	});
});
