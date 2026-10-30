import { dev } from '$app/environment';

/**
 * In development only, every request the new daydream engine makes of a
 * model, and what came back, written to `dream-log/` (gitignored) as one
 * Markdown file a request, by day: what was sent, message by message, the
 * thinking, the reply or the error, and where it went. So a daydream played
 * on a dev server can be read back in full while debugging, as the bench's
 * runs can (docs/dreams.md, "Capturing in development").
 *
 * Never in a build: `dev` is a build-time constant, so this, and the
 * `node:fs` it reaches for, are dead code everywhere but `vite dev`. What a
 * user wrote is in these files, which is fine on a developer's own machine
 * and nowhere else.
 */

export type Captured = {
	/** Which step asked: the route's last part (`read`, `passage`, `fill`…). */
	step: string;
	request: { model?: string; messages?: readonly { role: string; content: unknown }[] } & Record<
		string,
		unknown
	>;
	reply?: string;
	thinking?: string;
	provider?: string | null;
	usage?: unknown;
	error?: string;
};

const SECRET_KEYS = new Set(['apiKey', 'signal', 'onReasoning']);

function render(entry: Captured, at: Date): string {
	const settings = Object.fromEntries(
		Object.entries(entry.request).filter(([key]) => key !== 'messages' && !SECRET_KEYS.has(key))
	);
	const lines = [
		`# ${entry.step} · ${at.toISOString()}`,
		'',
		`Provider: ${entry.provider ?? 'unknown'}`,
		entry.usage ? `Usage: ${JSON.stringify(entry.usage)}` : '',
		'',
		'## Settings',
		'',
		'```json',
		JSON.stringify(settings, null, 2),
		'```'
	];
	for (const message of entry.request.messages ?? []) {
		const content =
			typeof message.content === 'string'
				? message.content
				: JSON.stringify(message.content, null, 2);
		lines.push('', `## ${message.role}`, '', '```', content, '```');
	}
	if (entry.thinking) {
		lines.push('', '## Thinking', '', '```', entry.thinking, '```');
	}
	if (entry.error) {
		lines.push('', '## Error', '', '```', entry.error, '```');
	}
	lines.push('', '## Reply', '', '```', entry.reply ?? '', '```', '');
	return lines.join('\n');
}

/** Writes one request and its reply, in development; does nothing anywhere else, and never throws. */
export async function capture(entry: Captured, root = 'dream-log'): Promise<void> {
	// The same shape as `db/backend.ts`: inside `if (dev)`, a build-time
	// constant, so the branch and its `node:fs` are gone from every build.
	if (dev) {
		try {
			const { mkdir, writeFile } = await import('node:fs/promises');
			const at = new Date();
			const day = at.toISOString().slice(0, 10);
			const time = at.toISOString().slice(11, 23).replaceAll(':', '-').replace('.', '-');
			const dir = `${root}/${day}`;
			await mkdir(dir, { recursive: true });
			await writeFile(`${dir}/${time}-${entry.step}.md`, render(entry, at));
		} catch {
			// Only ever a debugging aid: it never gets in the way.
		}
	}
}
