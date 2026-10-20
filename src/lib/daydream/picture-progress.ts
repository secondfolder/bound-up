/**
 * How full a picture's progress ring is while the picture is made
 * (docs/daydreams.md, "Pictures"). Runware says nothing until the picture
 * comes — measured: async delivery reports `processing` and no `progress`
 * for images — so the ring is drawn against how long pictures usually take
 * here, not against anything the picture itself reports.
 */

/** Used until this server has made a picture of the kind: about what Runware took when measured. */
export const FALLBACK_PICTURE_ESTIMATE_MS = 15_000;

/** How full the ring is when the estimate is up. */
export const AT_ESTIMATE = 2 / 3;

/** The most the ring ever shows. */
const MOST = 0.995;

/**
 * The ring's fill, 0 to below 1, after `elapsedMs` of a picture estimated to
 * take `estimateMs`.
 *
 * Steady up to two thirds at the estimate, so a picture on time ends with
 * the ring visibly short and then done, rather than full and waiting. Past
 * the estimate the rest closes exponentially and never arrives: a late
 * picture slows the ring rather than leaving it stuck at full. The curve
 * leaves the estimate at the speed it arrived at (a time constant of half
 * the estimate), so the slowing is gradual rather than a visible kink.
 */
export function pictureProgress(elapsedMs: number, estimateMs: number): number {
	const estimate = Math.max(estimateMs, 1);
	const elapsed = Math.max(elapsedMs, 0);
	if (elapsed <= estimate) {
		return AT_ESTIMATE * (elapsed / estimate);
	}
	const remaining = 1 - AT_ESTIMATE;
	// The steady part's slope is AT_ESTIMATE / estimate; the tail's at the
	// estimate is remaining / tau. Equal when tau is this.
	const tau = (remaining * estimate) / AT_ESTIMATE;
	// Capped short of full: the curve never gets there, but a float does,
	// a minute or so past a short estimate.
	return Math.min(1 - remaining * Math.exp(-(elapsed - estimate) / tau), MOST);
}
