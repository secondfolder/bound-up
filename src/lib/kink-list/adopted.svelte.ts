/**
 * How many answers were just brought into the account from this device, for
 * the kink list to say so. On its own, with no imports, so the screens can
 * read it without carrying the sealing code `adopt.svelte.ts` needs.
 */
export const adopted = $state({ count: 0 });
