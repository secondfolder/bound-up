// The package ships no types. This covers the one call app-version.ts makes.
declare module '@semantic-release/commit-analyzer' {
	export function analyzeCommits(
		pluginConfig: Record<string, unknown>,
		context: {
			commits: { hash: string; message: string }[];
			cwd: string;
			logger: { log: (...args: unknown[]) => void };
		}
	): Promise<'major' | 'minor' | 'patch' | null>;
}
