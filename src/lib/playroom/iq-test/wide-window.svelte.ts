import { MediaQuery } from 'svelte/reactivity';

/**
 * Whether the window is wide enough for the porn to sit in bands beside the
 * question rather than in strips above and below it: `60rem`. One query, read
 * by the page (its padding) and `PornLayout` (the bands) alike, and given to
 * the CSS as classes rather than repeated in a media query of its own, so
 * none of them can disagree — a pixel width in the script and rems in the
 * CSS did, for a reader with a larger default font size. Narrow until the
 * browser can say.
 */
export const wideWindow = new MediaQuery('width >= 60rem', false);
