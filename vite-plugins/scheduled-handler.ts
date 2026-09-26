import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { Plugin } from 'vite';

/**
 * Attaches a `scheduled` handler to the worker the Cloudflare adapter generates.
 *
 * The same problem `sveltekit-cloudflare-do` solves for Durable Objects: the
 * cron handler has to live on the worker entry's default export, the adapter
 * generates that module and has no hook for it, and no hand-written file can
 * take its place because the adapter `rimraf`s `main` before writing. So this
 * appends to the generated file once the adapter is done, which keeps plain
 * `wrangler deploy` correct.
 *
 * It assigns to the adapter's `worker_default` object rather than re-exporting
 * `default`, because a module can only have one default export. That leans on
 * the adapter's output shape, so a build whose worker no longer has that
 * binding **fails** rather than silently shipping a worker that never sweeps
 * expired media — the storage bill is the only symptom that would ever show.
 */

export const SCHEDULED_MARKER = '// SCHEDULED_HANDLER - do not remove';

const WORKER_BINDING = /^var worker_default = /m;

/** Pure, so the shape check can be tested without a build. */
export function appendScheduledHandler(worker: string, importPath: string): string {
	if (worker.includes(SCHEDULED_MARKER)) {
		return worker;
	}
	if (!WORKER_BINDING.test(worker)) {
		throw new Error(
			'[scheduled-handler] The generated worker has no `var worker_default`, so the ' +
				'cron handler cannot be attached. @sveltejs/adapter-cloudflare has changed ' +
				'its output: update WORKER_BINDING and the assignment in ' +
				'vite-plugins/scheduled-handler.ts to match .svelte-kit/cloudflare/_worker.js.'
		);
	}
	return (
		`${worker}\n${SCHEDULED_MARKER}\n` +
		`import { scheduled as __scheduled } from '${importPath}';\n` +
		'worker_default.scheduled = __scheduled;\n'
	);
}

export function scheduledHandler(options: { handler: string; workerPath?: string }): Plugin {
	let root = process.cwd();
	return {
		name: 'scheduled-handler',
		enforce: 'post',
		// Keeps it out of `vite dev` and vitest, where there is no worker file.
		apply: 'build',
		configResolved(config) {
			({ root } = config);
		},
		closeBundle() {
			const workerPath = path.resolve(
				root,
				options.workerPath ?? '.svelte-kit/cloudflare/_worker.js'
			);
			// `closeBundle` also runs for the client build, before the adapter has
			// written anything. Nothing to do yet.
			if (!existsSync(workerPath)) {
				return;
			}
			const importPath = path
				.relative(path.dirname(workerPath), path.resolve(root, options.handler))
				.split(path.sep)
				.join('/');
			const worker = readFileSync(workerPath, 'utf-8');
			const next = appendScheduledHandler(worker, importPath);
			if (next !== worker) {
				writeFileSync(workerPath, next, 'utf-8');
			}
		}
	};
}
