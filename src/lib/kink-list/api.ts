/**
 * Where a kink list is saved: `/api/spaces/[spaceId]/kink-list`, your own
 * list in your solo space and the copy you share in a partnership's shared
 * space. The server works out which from the space, and 404s one you are not
 * in. A partnership's shared space has the partnership's id, so the partner
 * stores pass the partnership id they already have (docs/spaces.md).
 */
export function kinkListPath(spaceId: string): string {
	return `/api/spaces/${encodeURIComponent(spaceId)}/kink-list`;
}
