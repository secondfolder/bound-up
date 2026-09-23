/**
 * Narrows away `null` and `undefined`, failing the test by name when the value
 * is missing.
 *
 * This is what a test reaches for instead of `value!`. The non-null assertion
 * only silences the type checker: when the value really is missing, the test
 * fails a few lines later with "Cannot read properties of undefined", which
 * names neither the thing that was missing nor the step that should have made
 * it. Alias-free, so the Playwright specs can import it too.
 */
export function defined<T>(value: T | null | undefined, what = 'value'): T {
	if (value === null || value === undefined) {
		throw new Error(`Expected ${what} to be present, but it was ${String(value)}`);
	}
	return value;
}
