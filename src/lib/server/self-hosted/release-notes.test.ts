import { type CommitKnownProps, writeChangelogString } from 'conventional-changelog-writer';
import { describe, expect, it } from 'vitest';

/**
 * Guards the release job's most fragile dependency pairing.
 *
 * `@semantic-release/release-notes-generator` loads the conventionalcommits
 * preset from the project root (`importFrom(cwd, …)`, because it does not
 * depend on the preset itself) but renders it with the
 * `conventional-changelog-writer` from its own dependency tree. Those two must
 * stay in step: preset v10 needs writer v9, while semantic-release 25 (the
 * latest stable) pins writer v8 — which is why package.json holds the preset
 * at `^9` and declares the writer it must pair with. A preset bump past that
 * therefore passes every check until the release job on `main` throws
 * "Missing helper", after the image is built and every test is green. This
 * renders a commit through the same preset-plus-writer pairing, mirroring the
 * generator's own mapping (`writerOpts: { …loadedConfig.writer }`), so the
 * mismatch fails here instead, on the PR.
 */
describe('release notes generation', () => {
	it('renders a commit with the conventionalcommits preset and the writer semantic-release ships', async () => {
		const preset = (await import('conventional-changelog-conventionalcommits')).default;
		const { writer: writerOpts } = await preset({});

		// The parser adds scope/subject/references on top of the writer's base
		// commit shape; the preset's templates render them, so they stay in.
		const commits: (CommitKnownProps & Record<string, unknown>)[] = [
			{
				type: 'fix',
				scope: null,
				subject: 'a bug fix',
				header: 'fix: a bug fix',
				notes: [],
				references: [],
				mentions: [],
				revert: null,
				hash: 'deadbee',
				committerDate: '2026-09-29T00:00:00.000Z'
			}
		];

		// The "Missing helper" failure mode is a throw from inside the render,
		// so the assertion is on the result, not around the import.
		const out = await writeChangelogString(
			commits,
			{ version: '0.2.1', title: '0.2.1' },
			writerOpts
		);

		expect(out).toContain('a bug fix');
	});
});
