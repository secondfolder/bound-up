/**
 * When an embed that needs a provider lookup should start loading.
 *
 * Only embeds that cannot draw anything until a provider answers wait for
 * this — images and curated players render straight away. The delay exists so
 * a fast scroll through a long thread does not fire a lookup for every embed
 * it flies past, while a reader who stops still gets their embed promptly.
 *
 * Pure arithmetic, kept out of the component so it can be read and tested on
 * its own: the thresholds are guesses tuned by feel, and a guess is much
 * easier to revisit when it is five lines in one place.
 */
export function embedActivationDelayMs(input: {
	intersectionRatio: number;
	distancePx: number;
	velocityPxPerMs: number;
}): number {
	const speed = Math.abs(input.velocityPxPerMs);
	// Well inside the scrollport: the reader is looking at it now.
	if (input.intersectionRatio >= 0.6) {
		return 0;
	}
	// Just off the edge and not moving fast — about to be looked at.
	if (input.distancePx <= 48 && speed < 1.4) {
		return 0;
	}
	// Stopped, or nearly. Nothing is gained by holding it back.
	if (speed < 0.2) {
		return 0;
	}
	if (speed < 0.7) {
		return 120;
	}
	if (input.distancePx < 120) {
		return 120;
	}
	if (speed < 1.4) {
		return 220;
	}
	return 360;
}
