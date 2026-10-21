import '@testing-library/jest-dom/vitest';
import { beforeAll } from 'vitest';
import { userEvent } from 'vitest/browser';
// The same registrations the app makes, so `wa-*` elements genuinely upgrade:
// real shadow roots, real form association. jsdom could not — it registered
// them and then threw on `ElementInternals.setFormValue`, which it lacks.
import '$lib/webawesome';

// Lit's dev-mode banner. `app.html` silences it for the app, but browser mode
// serves its own tester page, so it has to be repeated here.
globalThis.litIssuedWarnings ??= new Set();
globalThis.litIssuedWarnings.add('dev-mode');
globalThis.litIssuedWarnings.add(
	'Lit is in dev mode. Not recommended for production! See https://lit.dev/msg/dev-mode for more information.'
);

// Every file starts with the real mouse in the frame's far corner, where no
// test renders anything. The mouse belongs to the tab, not to a file: each
// file runs in a fresh frame filling the same tab, so the pointer sits
// wherever an earlier file's `userEvent` left it, and Chromium hovers
// whatever a new frame draws under it — `:hover` matches and `pointerenter`
// fires with no event the test sent. Which file ran before which varies from
// run to run, so this failed 1 full run in 10 and never a file on its own.
// Seen in MediaPanel.svelte.test.ts: the cursor was over its top-left
// picture, so the buttons took the pointer before any tap
// (`pointer-events` read `auto`, not `none`), and its rotation stayed held as
// if the picture were being looked at, so a poll for the next one timed out
// at 10s. A file that only hovered (100, 100) run just ahead of it failed
// both tests every time.
beforeAll(async () => {
	// A few pixels in and across, not a 1px dot flush with the edge: the
	// frame is scaled down into the tab (1280x800 into 1152x720), and
	// Playwright judged a 1px one there outside the viewport and waited out
	// its 30s timeout.
	const corner = document.createElement('div');
	corner.style.cssText = 'position: fixed; right: 4px; bottom: 4px; width: 4px; height: 4px';
	document.body.append(corner);
	try {
		await userEvent.hover(corner);
	} finally {
		corner.remove();
	}
});
