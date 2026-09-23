/**
 * The `default` of a switch that already handles every case.
 *
 * Lint wants every switch to have a default, and TypeScript only proves a
 * switch exhaustive when there is nothing to fall into. Passing the switched
 * value here does both: it only type-checks while the value is `never`, so a
 * new member of the union is a compile error at every switch that forgot it,
 * and a value the types said was impossible fails loudly rather than falling
 * through to `undefined`. Alias-free, so the Drizzle schema side can use it.
 */
export function assertNever(value: never, what = 'value'): never {
	throw new Error(`Unexpected ${what}: ${JSON.stringify(value)}`);
}
