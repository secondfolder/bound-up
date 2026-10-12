import type { Colour } from '$lib/playroom/iq-test/questions';

/** Ink colours for the Stroop questions: saturated enough on light and dark alike. */
export const INK: Record<Colour, string> = {
	red: '#d62828',
	blue: '#1f5fe0',
	green: '#2a9d3f',
	yellow: '#d9a400',
	purple: '#8a3fd1',
	orange: '#ef7a00',
	pink: '#ff3d9a'
};
