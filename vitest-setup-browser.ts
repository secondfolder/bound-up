import '@testing-library/jest-dom/vitest';
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
