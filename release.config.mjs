/**
 * semantic-release: works out the next version from the conventional commits
 * since the last `v*` tag, publishes the Docker image under it, then tags and
 * writes the GitHub Release. Run by the `release` job in
 * .github/workflows/ci.yml, only after every test has passed against the image.
 * See docs/self-hosting.md.
 *
 * Nothing is committed back: the version lives in the tag and the image, not
 * in package.json, which stays at its placeholder.
 */
export default {
	branches: ['main'],
	// biome-ignore lint/suspicious/noTemplateCurlyInString: a lodash template semantic-release fills in, not a JavaScript one.
	tagFormat: 'v${version}',
	plugins: [
		[
			'@semantic-release/commit-analyzer',
			{
				preset: 'conventionalcommits',
				releaseRules: [
					// Keeps the project on 0.x: a breaking change bumps the minor
					// version rather than jumping to 1.0.0. Delete this rule when it
					// is time for 1.0, and the next `feat!:` will make it.
					{ breaking: true, release: 'minor' }
				]
			}
		],
		['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
		[
			'@semantic-release/exec',
			{
				// In `prepare`, which runs BEFORE the tag is pushed, not `publish`,
				// which runs after: a push that fails then leaves no tag pointing
				// at an image that does not exist, and a rerun starts clean.
				// biome-ignore lint/suspicious/noTemplateCurlyInString: a lodash template semantic-release fills in, not a JavaScript one.
				prepareCmd: 'scripts/publish-image.sh ${nextRelease.version}'
			}
		],
		[
			'@semantic-release/github',
			{
				// Commenting on every issue and PR in a release needs write access
				// to both; the workflow grants only contents and packages.
				successComment: false,
				failComment: false,
				releasedLabels: false
			}
		]
	]
};
