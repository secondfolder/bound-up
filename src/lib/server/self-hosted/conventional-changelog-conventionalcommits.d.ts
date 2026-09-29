/**
 * `conventional-changelog-conventionalcommits@9` ships no type declarations
 * (v10 does, but v10 needs `conventional-changelog-writer@9`, which
 * semantic-release 25 does not ship — see `release-notes.test.ts` for why the
 * preset is pinned to v9). Only the shape that test reads is typed; the
 * `writer` options use the writer's own `Options` so the pairing is checked
 * structurally where the two packages meet.
 */
declare module 'conventional-changelog-conventionalcommits' {
	import type { Options } from 'conventional-changelog-writer';

	type ConventionalCommitsPreset = {
		parser: Record<string, unknown>;
		writer: Options;
		whatBump: (commits: unknown[]) => { level: number; reason?: string } | null;
	};

	const presetFactory: (config?: Record<string, unknown>) => Promise<ConventionalCommitsPreset>;

	// biome-ignore lint/style/noDefaultExport: the package default-exports its factory; a named export here would not describe the module being declared.
	export default presetFactory;
}
