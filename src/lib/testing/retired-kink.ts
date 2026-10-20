/**
 * A catalogue with one kink and one whole category retired, for testing what
 * retiring does without retiring real ones. Use it by mocking the catalogue's
 * data before anything imports it:
 *
 * ```ts
 * vi.mock('./catalog.json', async (original) =>
 *   (await import('$lib/testing/retired-kink')).withRetiredKink(await original())
 * );
 * ```
 *
 * The retired kink is a specific with a role pair and no children, so the
 * catalogue's own rules still hold, and so a test can see both its sides kept.
 * The retired category goes with every kink in it, as the rules require, and
 * is one no live kink lists in `alsoUnder`.
 */

export const RETIRED_KINK = 'face-fucking';
export const RETIRED_CATEGORY = 'money';
export const RETIRED_CATEGORY_KINKS = ['findom', 'tributes', 'spending-control'];
export const RETIRED_ON = '2026-11-01';

const RETIRED = new Set([RETIRED_KINK, RETIRED_CATEGORY, ...RETIRED_CATEGORY_KINKS]);

type CatalogData = { items: { id: string }[] };

export function withRetiredKink<T extends { default: CatalogData }>(module: T): T {
	const data = module.default;
	return {
		...module,
		default: {
			...data,
			items: data.items.map((item) =>
				RETIRED.has(item.id) ? { ...item, retiredOn: RETIRED_ON } : item
			)
		}
	};
}
