/**
 * An icon for each kind of element the build knows (docs/dreams.md,
 * "Elements"), so a card, a chip or a cast list says what it is at a glance.
 * Any other type the model invents gets the generic tag.
 */
const ICONS: Readonly<Record<string, string>> = {
	character: 'user',
	you: 'circle-user',
	place: 'location-dot',
	thing: 'cube',
	pressure: 'gauge-high'
};

export function elementIcon(type: string): string {
	return ICONS[type] ?? 'tag';
}
