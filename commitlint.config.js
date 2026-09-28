/**
 * Commit messages are what the release version is computed from
 * (release.config.mjs), so they are checked: by the `commit-msg` hook locally,
 * and by CI for every commit in a pull request. A `pref:` or `tests:` — both
 * in this history — would otherwise be silently left out of a release.
 */
export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		// This history writes subjects in sentence fragments with any casing,
		// and nothing reads the case; the type is what matters.
		'subject-case': [0]
	}
};
