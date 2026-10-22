/**
 * How credits are worded wherever tasks and rewards show them.
 *
 * Alias-free and pure, so the wording has one home and a node test: it used
 * to be spelled out at each site, and the reward cards said "1 credits" while
 * the task cards beside them pluralised correctly.
 */

/** "1 credit", "3 credits". */
export function creditsLabel(credits: number): string {
	return `${credits} credit${credits === 1 ? '' : 's'}`;
}
