import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appVersion, FALLBACK_VERSION, latestRelease } from './app-version.ts';

let repo: string;

/** Git in the scratch repo, with nothing from the developer's own config. */
function git(...args: string[]) {
	execFileSync(
		'git',
		[
			'-c',
			'user.name=Test',
			'-c',
			'user.email=test@example.com',
			'-c',
			'commit.gpgsign=false',
			'-c',
			'tag.gpgsign=false',
			'-c',
			'core.hooksPath=/dev/null',
			...args
		],
		{ cwd: repo, stdio: 'ignore' }
	);
}

function commit(message: string) {
	git('commit', '--allow-empty', '--quiet', '-m', message);
}

/** The env with no `APP_VERSION`, so the history decides. */
const version = () => appVersion({ cwd: repo, env: {} });

beforeEach(() => {
	repo = mkdtempSync(path.join(tmpdir(), 'app-version-'));
	git('init', '--quiet', '--initial-branch=main');
});

afterEach(() => {
	rmSync(repo, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe('appVersion', () => {
	it('is the last release when nothing since would make a new one', async () => {
		commit('feat: first');
		git('tag', 'v1.4.2');
		commit('chore: tidy');
		commit('docs: explain');
		expect(await version()).toBe('1.4.2');
	});

	it('bumps the patch for a fix and the minor for a feature, the highest winning', async () => {
		commit('feat: first');
		git('tag', 'v1.4.2');
		commit('fix: a bug');
		expect(await version()).toBe('1.4.3');
		commit('feat: a thing');
		commit('fix: another bug');
		expect(await version()).toBe('1.5.0');
	});

	it('follows release.config.mjs in bumping only the minor for a breaking change', async () => {
		commit('feat: first');
		git('tag', 'v1.4.2');
		commit('feat!: everything is different');
		expect(await version()).toBe('1.5.0');
	});

	it('counts from the highest release the commit contains, not the newest tag', async () => {
		commit('feat: first');
		git('tag', 'v2.0.0');
		commit('fix: later');
		git('tag', 'v1.9.9');
		commit('fix: since');
		expect(await version()).toBe('2.0.1');
	});

	it('ignores releases on history the commit does not contain', async () => {
		commit('feat: first');
		git('tag', 'v1.0.0');
		git('checkout', '--quiet', '-b', 'other');
		commit('feat: elsewhere');
		git('tag', 'v1.1.0');
		git('checkout', '--quiet', 'main');
		commit('fix: here');
		expect(await version()).toBe('1.0.1');
	});

	it("is semantic-release's first release before any tag exists", async () => {
		commit('feat: first');
		expect(await version()).toBe('1.0.0');
	});

	it('marks a build from a branch that is never released with its commit', async () => {
		commit('feat: first');
		git('tag', 'v1.0.0');
		git('checkout', '--quiet', '-b', 'feature');
		commit('feat: one');
		const first = await version();
		commit('fix: two');
		const second = await version();

		expect(first).toMatch(/^1\.1\.0\+[0-9a-f]{7,}$/);
		expect(second).toMatch(/^1\.1\.0\+[0-9a-f]{7,}$/);
		expect(second, 'two commits on the branch can be told apart').not.toBe(first);
	});

	it('marks a detached HEAD, whose branch is unknown', async () => {
		commit('feat: first');
		git('tag', 'v1.0.0');
		git('checkout', '--quiet', '--detach');
		expect(await version()).toMatch(/^1\.0\.0\+[0-9a-f]{7,}$/);
	});

	it("goes by Cloudflare's WORKERS_CI_BRANCH, since its build is detached", async () => {
		commit('feat: first');
		git('tag', 'v1.0.0');
		git('checkout', '--quiet', '--detach');
		const env = (branch: string) => ({ WORKERS_CI_BRANCH: branch });
		expect(await appVersion({ cwd: repo, env: env('main') })).toBe('1.0.0');
		expect(await appVersion({ cwd: repo, env: env('preview') })).toMatch(/^1\.0\.0\+/);
	});

	it('takes APP_VERSION from the environment over the history', async () => {
		commit('feat: first');
		git('tag', 'v1.0.0');
		expect(await appVersion({ cwd: repo, env: { APP_VERSION: '9.9.9' } })).toBe('9.9.9');
	});

	it('falls back, with a warning, when there is no git history to read', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const bare = mkdtempSync(path.join(tmpdir(), 'app-version-bare-'));
		try {
			// GIT_CEILING_DIRECTORIES stops git finding a repository above the
			// temp directory, which a developer's home could be.
			vi.stubEnv('GIT_CEILING_DIRECTORIES', path.dirname(bare));
			expect(await appVersion({ cwd: bare, env: {} })).toBe(FALLBACK_VERSION);
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('set APP_VERSION'));
		} finally {
			vi.unstubAllEnvs();
			rmSync(bare, { recursive: true, force: true });
		}
	});
});

describe('latestRelease', () => {
	it('picks by version and skips prereleases and strangers', () => {
		expect(latestRelease('v1.10.0\nv1.9.0\nv2.0.0-beta.1\nrelease-3\nv1.2')).toEqual({
			tag: 'v1.10.0',
			version: [1, 10, 0]
		});
	});

	it('is null with nothing released', () => {
		expect(latestRelease('')).toBeNull();
	});
});
