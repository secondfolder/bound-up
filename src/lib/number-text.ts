/**
 * A number typed as text, read the way every field that takes one reads it:
 * empty is none, anything that is not a finite number is an error to show
 * under the field (`FieldError.svelte`). The field is a text box with
 * `inputmode="decimal"` rather than `type="number"`, whose control throws
 * away what it cannot read ("1e", "--") and reports an empty value, so a
 * mistake could not be told from nothing typed. Alias-free and pure.
 */
export type NumberText = { value: number | null; error: null } | { value: null; error: string };

export const NOT_A_NUMBER = 'Enter a number, like 12 or 4.5';

export function readNumberText(text: string): NumberText {
	const trimmed = text.trim().replace(/,/g, '');
	if (trimmed === '') {
		return { value: null, error: null };
	}
	const value = Number(trimmed);
	return Number.isFinite(value) ? { value, error: null } : { value: null, error: NOT_A_NUMBER };
}
