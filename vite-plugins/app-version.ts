import { execFileSync } from 'node:child_process';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import releaseConfig from '../release.config.mjs';

/**
 * The version a build shows: what semantic-release has released, or will
 * release, for the commit being built.
 *
 * Nothing records the version in the repository — `package.json` stays at its
 * placeholder, and the version lives in the `v*` tag that the release job
 * pushes (see docs/self-hosting.md). But Cloudflare's deploy-on-push builds a
 * commit on `main` before CI has tagged it, so the tag cannot simply be read.
 * Instead this repeats semantic-release's own arithmetic: the highest `v*` tag
 * the commit contains, bumped by semantic-release's commit analyzer, run with
 * the exact configuration from `release.config.mjs`, over the commits since.
 * The two therefore agree by construction, `{ breaking: true, release: 'minor' }`
 * and all. A commit that releases nothing (`chore:`, `docs:`) shows the version
 * it was deployed on top of, which is what it is.
 *
 * A build from any other branch than the ones semantic-release releases from
 * (a Worker Preview, a local feature branch) also carries its commit as semver
 * build metadata: `1.2.0+3f2a9c1`. Such a branch is never tagged, so after its
 * first `feat:` every later commit comes out as the same number, and a reload
 * onto a new deploy would look like it had changed nothing.
 *
 * `APP_VERSION` in the environment wins, for a build that already knows its
 * version. The Docker build has no `.git` to read (it is in .dockerignore), so
 * it comes out as `FALLBACK_VERSION` here and the image sets `APP_VERSION` at
 * runtime instead — see `src/lib/server/app-version.ts`.
 *
 * Plain, erasable TypeScript, like `build-target.ts`: this runs in Node when
 * vite.config.ts is loaded.
 */
export async function appVersion({
	cwd = process.cwd(),
	env = process.env
}: {
	cwd?: string;
	env?: Record<string, string | undefined>;
} = {}): Promise<string> {
	if (env.APP_VERSION) {
		return env.APP_VERSION;
	}
	try {
		return await versionFromHistory(cwd, env);
	} catch (error) {
		// A warning rather than a failed build: a wrong version on the settings
		// page is not worth refusing to deploy over, and a source tree without
		// git history (the Docker build, a tarball) is legitimate.
		const reason = error instanceof Error ? error.message : String(error);
		console.warn(
			`Could not work out the app version from git, so it will show as ${FALLBACK_VERSION}: ${reason}\n` +
				'Build from a git checkout with its tags, or set APP_VERSION.'
		);
		return FALLBACK_VERSION;
	}
}

/** The same placeholder the Dockerfile's `VERSION` build arg defaults to. */
export const FALLBACK_VERSION = '0.0.0-dev';

/** semantic-release's own default for a repository with no release yet. */
const FIRST_RELEASE = '1.0.0';

type Version = [major: number, minor: number, patch: number];

/** A plain release; a prerelease suffix does not match. */
const RELEASE_VERSION = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/;

async function versionFromHistory(
	cwd: string,
	env: Record<string, string | undefined>
): Promise<string> {
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

	// Cloudflare's build clones shallowly, which leaves neither the tags nor
	// the commits since them. Without this every deploy would count from
	// whatever commit the clone happened to stop at.
	if (git('rev-parse', '--is-shallow-repository') === 'true') {
		git('fetch', '--unshallow', '--tags', '--quiet');
	}

	const last = latestRelease(git('tag', '--merged', 'HEAD', '--list', tagPattern()));
	const range = last ? [`${last.tag}..HEAD`] : ['HEAD'];
	const commits = parseLog(git('log', '--format=%H%x1f%B%x1e', ...range));

	const releaseType = await analyzeCommits(commitAnalyzerConfig(), {
		commits,
		cwd,
		// The analyzer narrates every commit; a build log does not need that.
		logger: { log: () => undefined }
	});

	let version = FALLBACK_VERSION;
	if (last) {
		version = format(releaseType ? bump(last.version, releaseType) : last.version);
	} else if (releaseType) {
		version = FIRST_RELEASE;
	}

	// Cloudflare's build checks out a detached HEAD and names the branch in
	// WORKERS_CI_BRANCH instead. A detached HEAD with no such variable is
	// `HEAD` here, which no release branch is called, so it is marked too: an
	// unknown branch is not known to be a release.
	const branch = env.WORKERS_CI_BRANCH ?? git('rev-parse', '--abbrev-ref', 'HEAD');
	if (releaseConfig.branches.includes(branch)) {
		return version;
	}
	return `${version}+${git('rev-parse', '--short', 'HEAD')}`;
}

/** `v${version}` → `v*`, so a change of `tagFormat` is followed here too. */
function tagPattern(): string {
	// biome-ignore lint/suspicious/noTemplateCurlyInString: the lodash placeholder in semantic-release's `tagFormat`, not a JavaScript template.
	return releaseConfig.tagFormat.replace('${version}', '*');
}

/**
 * The highest released version among `tags`, as semantic-release picks it:
 * by version, not by date or by distance from HEAD. Prereleases are left out,
 * since `main` publishes none.
 */
export function latestRelease(tags: string): { tag: string; version: Version } | null {
	const prefix = tagPattern().replace('*', '');
	let best: { tag: string; version: Version } | null = null;
	for (const tag of tags.split('\n')) {
		const match: RegExpExecArray | null = RELEASE_VERSION.exec(tag.slice(prefix.length));
		if (!(tag.startsWith(prefix) && match?.groups)) {
			continue;
		}
		const { major, minor, patch } = match.groups;
		const version: Version = [Number(major), Number(minor), Number(patch)];
		if (!best || compare(version, best.version) > 0) {
			best = { tag, version };
		}
	}
	return best;
}

function parseLog(log: string): { hash: string; message: string }[] {
	return log
		.split('\x1e')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [hash = '', message = ''] = entry.split('\x1f');
			return { hash, message };
		});
}

function commitAnalyzerConfig(): Record<string, unknown> {
	for (const plugin of releaseConfig.plugins) {
		const [name, config] = Array.isArray(plugin) ? plugin : [plugin, {}];
		if (name === '@semantic-release/commit-analyzer' && typeof config === 'object') {
			return config;
		}
	}
	throw new Error('release.config.mjs no longer lists @semantic-release/commit-analyzer.');
}

function compare(a: Version, b: Version): number {
	return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function bump([major, minor, patch]: Version, type: string): Version {
	switch (type) {
		case 'major':
			return [major + 1, 0, 0];
		case 'minor':
			return [major, minor + 1, 0];
		case 'patch':
			return [major, minor, patch + 1];
		default:
			throw new Error(`The commit analyzer asked for an unknown release type: ${type}`);
	}
}

function format(version: Version): string {
	return version.join('.');
}
