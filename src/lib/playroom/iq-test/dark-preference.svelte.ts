import { MediaQuery } from 'svelte/reactivity';

/**
 * Whether the device asks for a dark page, for `themeFor`. One query, read by
 * the page and `PagePreview` alike, so the preview cannot show a scheme the
 * page will not. Light until the browser can say: the server cannot know, so
 * a dark-preferring device sees the light theme until hydration.
 */
export const darkPreference = new MediaQuery('prefers-color-scheme: dark', false);
