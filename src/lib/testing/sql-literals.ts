/**
 * Writing a statement's values into it as SQL literals, for the Playwright
 * suite's Workers run (`e2e/db.ts`), whose way into the worker's D1 binds
 * parameters as text only. Here rather than in `e2e/` so the unit tests
 * reach it.
 */

export type SqlValue = string | number | null;

/**
 * The statement with its values written in as SQL literals.
 *
 * The explorer API binds parameters as text only, and refuses a null or a
 * number outright, so a spec's `expires_at = ?` with a timestamp could not be
 * sent as one. Written in instead: a number as itself, null as `NULL`, a
 * string quoted with its quotes doubled, which is SQLite's own escaping, so
 * no value can change what the statement does. A `?` inside a quoted string
 * in the statement is text, not a placeholder.
 */
export function withLiterals(statement: string, args: SqlValue[]): string {
	let next = 0;
	let out = '';
	let quote: string | null = null;
	for (const char of statement) {
		if (quote) {
			out += char;
			if (char === quote) {
				quote = null;
			}
		} else if (char === "'" || char === '"') {
			quote = char;
			out += char;
		} else if (char === '?') {
			if (next >= args.length) {
				throw new Error(`More placeholders than values in: ${statement}`);
			}
			out += literal(args[next] as SqlValue);
			next += 1;
		} else {
			out += char;
		}
	}
	if (next !== args.length) {
		throw new Error(`${args.length} values for ${next} placeholders in: ${statement}`);
	}
	return out;
}

function literal(value: SqlValue): string {
	if (value === null) {
		return 'NULL';
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new Error(`Cannot write ${value} into SQL`);
		}
		return String(value);
	}
	return `'${value.replaceAll("'", "''")}'`;
}
