/** The field superforms reads a JSON post from. */
const FIELD = '__superform_json';

/**
 * A form action's post as a `dataType: 'json'` superform sends it: the data
 * in one `__superform_json` field, in devalue's format, which is the only way
 * nested data (an array of objects, say) reaches the action. A flat
 * `formData` cannot carry it.
 *
 * Written out by hand for JSON-safe data rather than by importing devalue,
 * which is SvelteKit's dependency and not this project's: devalue's format is
 * an array whose first entry is the root, every object and array pointing at
 * its members by index, and every other value stored as it is.
 */
export function superformJson(data: Record<string, unknown>): Record<string, string> {
	const values: unknown[] = [];
	const add = (value: unknown): number => {
		const index = values.length;
		values.push(null);
		if (Array.isArray(value)) {
			values[index] = value.map(add);
		} else if (typeof value === 'object' && value !== null) {
			values[index] = Object.fromEntries(
				Object.entries(value)
					.filter(([, member]) => member !== undefined)
					.map(([key, member]) => [key, add(member)])
			);
		} else {
			values[index] = value;
		}
		return index;
	};
	add(data);
	return { [FIELD]: JSON.stringify(values) };
}
