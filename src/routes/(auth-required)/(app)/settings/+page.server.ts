import { appVersion } from '$lib/server/app-version';
import type { PageServerLoad } from './$types';

// From the server rather than read from `__APP_VERSION__` in the page: the
// Docker image only learns its version at runtime. See $lib/server/app-version.
export const load: PageServerLoad = () => ({ appVersion: appVersion() });
