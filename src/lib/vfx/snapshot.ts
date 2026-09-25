/**
 * Marks an element that `VfxPageSnapshot` leaves out of its capture of the
 * page: the provider's effects layer (which shows what captures produce), and
 * any foreground chrome meant to sit above the effect rather than be drawn
 * into it — the landing page's CTA.
 */
export const PAGE_SNAPSHOT_IGNORE_ATTRIBUTE = 'data-vfx-capture-ignore';

export const PAGE_SNAPSHOT_IGNORE_SELECTOR = `[${PAGE_SNAPSHOT_IGNORE_ATTRIBUTE}="true"]`;
