import { env } from '$env/dynamic/private';

/**
 * The release version this server is running, for display.
 *
 * Normally the one baked in at build time (`__APP_VERSION__`, see
 * vite-plugins/app-version.ts). The Docker image is the exception: CI builds
 * and tests it before semantic-release has decided the version, and releases
 * the same layers, so the version arrives as `APP_VERSION` in the image's last
 * layer instead (see the Dockerfile) and is read here at runtime. Only for the
 * self-hosted build, so a stray variable cannot relabel a Workers deploy.
 */
export function appVersion(): string {
	if (__SELF_HOSTED__ && env.APP_VERSION) {
		return env.APP_VERSION;
	}
	return __APP_VERSION__;
}
