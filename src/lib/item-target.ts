import type { PartnerNamesSource } from './partnership';

/**
 * The space a task or reward form writes to: the one a new one is added to,
 * named in the form, or the one an edited one is in. `partner` is the other
 * member of a shared space — for whose time a task runs in — and null for the
 * viewer's own.
 */
export type ItemTarget = {
	spaceId: string;
	kind: 'solo' | 'shared';
	partner: { userId: string; timezone: string; names: PartnerNamesSource } | null;
};
