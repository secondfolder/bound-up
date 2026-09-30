import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Runs `e2e/*.capture.ts` — scripts that drive the app to take the landing
 * page's screenshots — against the same server the e2e suite uses. Kept out
 * of `playwright.config.ts`, which only matches `*.spec.ts`, so `npm test`
 * never rewrites the committed images.
 */
export default defineConfig({
	...base,
	testMatch: '**/*.capture.ts',
	workers: 1,
	retries: 0,
	reporter: 'list'
});
