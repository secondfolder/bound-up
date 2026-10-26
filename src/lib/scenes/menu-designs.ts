/**
 * The looks a scene's menu can take, from restaurant menus to kink vibes. A
 * design is a name, a heading the menu shows, how it writes an item's
 * number (a price, mostly; a percentage on a nutrition label), and a block
 * of CSS (`menu-designs.css`) keyed by its id, which draws it on the frame
 * every menu has (`menu-frame.ts`), an item's rating (hearts, stars, bones)
 * included. Every layout responds to the menu's own width, so a design that
 * breaks into columns does it only where there is room.
 * Alias-free and pure. See docs/scenes.md, "Menu designs".
 *
 * Stored on the menu (`design`), so both partners see the same one. An id
 * this build does not know reads as the default, so a design can be retired
 * without breaking a menu that used it.
 */

export const MENU_DESIGN_IDS = [
	'fine',
	'diner',
	'izakaya',
	'bimbo',
	'office',
	'academia',
	'chalk',
	'lounge',
	'trattoria',
	'dungeon',
	'glossy',
	'ticket',
	'facts',
	'pet',
	'letter',
	'clinic',
	'soft',
	'royal',
	'cork',
	'tarot',
	'seeds',
	'sampler',
	'toys'
] as const;

export type MenuDesignId = (typeof MENU_DESIGN_IDS)[number];

/**
 * Where a design's copy goes in the frame (`menu-frame.ts`): its heading,
 * the heading's note, between the heading and the courses, its foot, or on
 * one of its drawings (1 to `ART_PIECES`).
 */
export type MenuCopyPlace = 'head' | 'note' | 'intro' | 'foot' | `art${number}`;

/**
 * Words of a design's own that only make sense on it ("TO: My assistant" on
 * the memo), which anyone can rewrite on the menu itself. What they write is
 * kept per design, so another design never shows it and coming back does.
 */
export type MenuCopy = {
	key: string;
	place: MenuCopyPlace;
	text: string;
	/**
	 * Its lines are fields of a form ("PATIENT: my good patient"): each
	 * line's words up to and including its first colon are the field's
	 * label, printed, and the rest is what was filled in, which the design
	 * sets apart (`copyFields`).
	 */
	fields?: true;
	/**
	 * Enter is done with it rather than starting a new line, where another
	 * line would break the design (a stamp, a starburst, a ticket's stub).
	 * Any other copy takes as many lines as someone types.
	 */
	oneLine?: true;
};

/** One line of copy that is a form's fields: its label (with its colon), and what follows. */
export type CopyField = { label: string; value: string };

/**
 * Splits copy that is fields into its lines, each at its first colon. A
 * line with no colon is all label, a field still to be filled in (and what
 * a label is while it is being typed). The value keeps its leading space, so
 * that joining label and value gives the line back exactly, which is what
 * lets the editor redraw it as it is typed without moving a character.
 */
export function copyFields(text: string): CopyField[] {
	return text.split('\n').map((line) => {
		const colon = line.indexOf(':');
		return colon === -1
			? { label: line, value: '' }
			: { label: line.slice(0, colon + 1), value: line.slice(colon + 1) };
	});
}

/**
 * A picture a design offers: its id, its name, and its file, and what comes
 * with it where a design shows more than the picture, as a seed packet
 * shows its flower's Latin name (`caption`) on a plate of its colour
 * (`tint`).
 */
export type MenuArtChoice = {
	id: string;
	name: string;
	url: string;
	caption?: string;
	tint?: string;
};

/**
 * A picture each course has, which anyone can change on the menu by tapping
 * it: a course shows its own choice where it has one (kept on the course,
 * per design), and otherwise the next of `choices` in turn, by its place.
 */
export type MenuCourseArt = {
	/** What the picture is, for the question that changes it: "Toy". */
	label: string;
	choices: readonly MenuArtChoice[];
};

/**
 * A design's mascot (the pup on "Good Pup"), which anyone can change on the
 * menu by tapping it, as a course's picture. Kept on the menu, per design.
 * The one chosen can bring a title of its own, for a menu with none ("Good
 * Kitty"), and the menu is marked with its id (`data-mascot`) for the design
 * to dress the rest to match.
 */
export type MenuMascot = MenuArtChoice & { title?: string };

/**
 * A row of pictures in a design's heading (the sampler's bunny, flower and
 * fox), each of which anyone can change on the menu by tapping it, as a
 * course's picture. `slots` is the design's own choice for each place in
 * the row, and how many there are. What is chosen is kept on the menu, per
 * design and per place (`picturesFor`).
 */
export type MenuPictures = {
	label: string;
	choices: readonly MenuArtChoice[];
	slots: readonly string[];
};

export type MenuDesign = {
	id: MenuDesignId;
	name: string;
	/** The heading the menu shows above its courses. */
	title: string;
	/** The line under the title a menu has when it has none of its own; none if absent. */
	subtitle?: string;
	/** Its own words, in the order they are placed. */
	copy?: readonly MenuCopy[];
	/** A picture on each course that can be changed (`MenuCourseArt`). */
	courseArt?: MenuCourseArt;
	/** Its mascot, and the others it can be changed to; the first unless one is chosen. */
	mascot?: { label: string; choices: readonly MenuMascot[] };
	/** A row of pictures in its heading, each changed on its own (`MenuPictures`). */
	pictures?: MenuPictures;
	/** An item's number as the design writes it: a price, mostly, but a percentage on a nutrition label. */
	value: (value: number) => string;
	/** The mark that stands for the number in the menu's key, beside what it means: "$". */
	valueKey: string;
};

export const MENU_DESIGNS: Record<MenuDesignId, MenuDesign> = {
	fine: {
		id: 'fine',
		name: 'Fine dining',
		title: 'Menu',
		value: (n) => `${n}`,
		valueKey: ''
	},
	diner: {
		id: 'diner',
		name: 'American diner',
		title: 'Blue Plate',
		value: (n) => `$${n.toFixed(2)}`,
		valueKey: '$'
	},
	izakaya: {
		id: 'izakaya',
		name: 'Izakaya',
		title: 'Omakase',
		value: (n) => `¥${n}`,
		valueKey: '¥'
	},
	bimbo: {
		id: 'bimbo',
		name: 'Bimbo',
		title: 'Treat Yourself',
		value: (n) => `$${n}`,
		valueKey: '$'
	},
	office: {
		id: 'office',
		name: 'Office after hours',
		title: 'MEMO',
		value: (n) => `$${n}`,
		valueKey: '$',
		copy: [
			{ key: 'stamp', place: 'art1', text: 'APPROVED', oneLine: true },
			{
				key: 'memo',
				place: 'note',
				text: 'TO: My assistant\nRE: Tonight, after everyone leaves\nFROM: The boss',
				fields: true
			}
		]
	},
	academia: {
		id: 'academia',
		name: 'Dark academia',
		title: 'A Private Syllabus',
		value: (n) => `p. ${n}`,
		valueKey: 'p.',
		copy: [
			{ key: 'bookplate', place: 'note', text: 'Ex Libris', oneLine: true },
			{ key: 'college', place: 'head', text: 'Collegium Noctis · Michaelmas Term' },
			{
				key: 'epigraph',
				place: 'intro',
				text: '“I have loved the stars too fondly to be fearful of the night.”\nSarah Williams'
			}
		]
	},
	chalk: {
		id: 'chalk',
		name: 'L’ardoise',
		title: 'Ce Soir',
		value: (n) => `${n}€`,
		valueKey: '€'
	},
	lounge: {
		id: 'lounge',
		name: 'Deco lounge',
		title: 'After Dark',
		value: (n) => `${n}`,
		valueKey: ''
	},
	trattoria: {
		id: 'trattoria',
		name: 'Trattoria',
		title: 'Stasera',
		value: (n) => `€${n}`,
		valueKey: '€'
	},
	dungeon: {
		id: 'dungeon',
		name: 'Dungeon board',
		title: 'The Cellar',
		value: (n) => `${n} gold`,
		valueKey: 'gold'
	},
	glossy: {
		id: 'glossy',
		name: 'Glossy cover',
		title: 'Treat',
		value: (n) => `$${n}`,
		valueKey: '$',
		copy: [
			{ key: 'issue', place: 'note', text: 'Nº 69 · Saturday', oneLine: true },
			{ key: 'burst', place: 'head', text: 'NEW!\ntonight\nonly', oneLine: true },
			{ key: 'plus', place: 'foot', text: 'Plus!' },
			{
				key: 'lines',
				place: 'foot',
				text: 'Brat or pillow princess? Take our quiz · 47 ways to say please'
			}
		]
	},
	ticket: {
		id: 'ticket',
		name: 'Club ticket',
		title: 'Club Menu',
		value: (n) => `$${n}`,
		valueKey: '$',
		copy: [{ key: 'admit', place: 'note', text: 'Admit two · VIP', oneLine: true }]
	},
	facts: {
		id: 'facts',
		name: 'Nutrition facts',
		title: 'Nutrition Facts',
		value: (n) => `${n}%`,
		valueKey: '%',
		copy: [
			{ key: 'serving', place: 'note', text: 'Serving size', oneLine: true },
			{ key: 'amount', place: 'note', text: '1 evening', oneLine: true },
			{
				key: 'footnote',
				place: 'foot',
				text: '*The % Daily Value says how much of tonight’s limit a course uses. Based on one consenting adult, well rested.'
			},
			{
				key: 'ingredients',
				place: 'art1',
				text: 'INGREDIENTS: everything on this label, and each other.',
				fields: true
			},
			{
				key: 'contains',
				place: 'art2',
				text: 'CONTAINS: consent. MAY CONTAIN: traces of begging.',
				fields: true
			},
			{ key: 'best', place: 'art3', text: 'BEST BEFORE: TONIGHT', fields: true, oneLine: true },
			{ key: 'keep', place: 'art4', text: 'KEEP AWAY FROM\nANYONE NOT INVITED' }
		]
	},
	pet: {
		id: 'pet',
		name: 'Pet play',
		title: 'Good Pup',
		value: (n) => `${n} treats`,
		valueKey: 'treats',
		copy: [{ key: 'kind', place: 'note', text: 'treats menu' }],
		mascot: {
			label: 'Pet',
			choices: [
				{ id: 'pup', name: 'Pup', url: '/menu-art/pup.svg', title: 'Good Pup' },
				{ id: 'kitty', name: 'Kitty', url: '/menu-art/kitty.svg', title: 'Good Kitty' }
			]
		},
		courseArt: {
			label: 'Toy',
			choices: [
				{ id: 'ball', name: 'Tennis ball', url: '/menu-art/pet-ball.svg' },
				{ id: 'bowl', name: 'Food bowl', url: '/menu-art/pet-bowl.svg' },
				{ id: 'bone', name: 'Chew bone', url: '/menu-art/pet-bone.svg' },
				{ id: 'cushion', name: 'Cushion', url: '/menu-art/pet-cushion.svg' },
				{ id: 'frisbee', name: 'Frisbee', url: '/menu-art/pet-frisbee.svg' },
				{ id: 'rope', name: 'Tug rope', url: '/menu-art/pet-rope.svg' },
				{ id: 'duck', name: 'Squeaky duck', url: '/menu-art/pet-duck.svg' },
				{ id: 'biscuit', name: 'Biscuit', url: '/menu-art/pet-biscuit.svg' },
				{ id: 'yarn', name: 'Ball of yarn', url: '/menu-art/pet-yarn.svg' },
				{ id: 'mouse', name: 'Toy mouse', url: '/menu-art/pet-mouse.svg' },
				{ id: 'fish', name: 'Fish', url: '/menu-art/pet-fish.svg' },
				{ id: 'feather', name: 'Feather wand', url: '/menu-art/pet-feather.svg' }
			]
		}
	},
	letter: {
		id: 'letter',
		name: 'Love letter',
		title: 'My darling,',
		value: (n) => `£${n}`,
		valueKey: '£',
		copy: [
			{ key: 'date', place: 'note', text: 'Saturday evening' },
			{ key: 'signoff', place: 'foot', text: 'At your pleasure, always' }
		]
	},
	clinic: {
		id: 'clinic',
		name: 'Prescription pad',
		title: 'Treatment plan',
		value: (n) => `${n}mg`,
		valueKey: 'mg',
		copy: [
			{ key: 'doctor', place: 'note', text: 'Dr. ________\nPrivate practice' },
			{
				key: 'patient',
				place: 'head',
				text: 'PATIENT: my good patient\nDATE: tonight',
				fields: true
			},
			{ key: 'prescribed', place: 'foot', text: 'Prescribed by', oneLine: true },
			{ key: 'signature', place: 'foot', text: 'the doctor', oneLine: true }
		]
	},
	soft: {
		id: 'soft',
		name: 'Bedtime story',
		title: 'Gentle Night',
		value: (n) => `${n}¢`,
		valueKey: '¢',
		copy: [{ key: 'once', place: 'note', text: 'Once upon a cosy evening…' }]
	},
	royal: {
		id: 'royal',
		name: 'Royal decree',
		title: 'By Decree',
		value: (n) => `${n} crowns`,
		valueKey: 'crowns',
		copy: [
			{
				key: 'decree',
				place: 'note',
				text: 'Be it known to the one who kneels that this evening shall proceed in the order set down below, and that nothing shall be done outside of it.'
			}
		]
	},
	cork: {
		id: 'cork',
		name: 'Corkboard',
		title: 'TONIGHT',
		value: (n) => `$${n}`,
		valueKey: '$'
	},
	tarot: {
		id: 'tarot',
		name: 'Tarot spread',
		title: 'The Reading',
		value: (n) => `${n}`,
		valueKey: ''
	},
	seeds: {
		id: 'seeds',
		name: 'Seed packets',
		title: 'Seeds of the Evening',
		value: (n) => `${n}¢`,
		valueKey: '¢',
		courseArt: {
			label: 'Flower',
			choices: [
				{
					id: 'daisy',
					name: 'Daisy',
					url: '/menu-art/flower-daisy.svg',
					caption: 'Bellis tactilis',
					tint: '#e9f1df'
				},
				{
					id: 'tulip',
					name: 'Tulip',
					url: '/menu-art/flower-tulip.svg',
					caption: 'Tulipa ardens',
					tint: '#f6e3e6'
				},
				{
					id: 'poppy',
					name: 'Poppy',
					url: '/menu-art/flower-poppy.svg',
					caption: 'Papaver nocturnum',
					tint: '#f4e7dc'
				},
				{
					id: 'lavender',
					name: 'Lavender',
					url: '/menu-art/flower-lavender.svg',
					caption: 'Lavandula quies',
					tint: '#ebe5f3'
				},
				{
					id: 'rose',
					name: 'Rose',
					url: '/menu-art/flower-rose.svg',
					caption: 'Rosa susurrans',
					tint: '#f6e0e4'
				},
				{
					id: 'sunflower',
					name: 'Sunflower',
					url: '/menu-art/flower-sunflower.svg',
					caption: 'Helianthus matutinus',
					tint: '#f6efd6'
				},
				{
					id: 'iris',
					name: 'Iris',
					url: '/menu-art/flower-iris.svg',
					caption: 'Iris languida',
					tint: '#e6e4f4'
				},
				{
					id: 'bluebell',
					name: 'Bluebell',
					url: '/menu-art/flower-bluebell.svg',
					caption: 'Hyacinthoides tremula',
					tint: '#e3e9f5'
				},
				{
					id: 'forget-me-not',
					name: 'Forget-me-not',
					url: '/menu-art/flower-forget-me-not.svg',
					caption: 'Myosotis memor',
					tint: '#e2eef6'
				},
				{
					id: 'blossom',
					name: 'Cherry blossom',
					url: '/menu-art/flower-blossom.svg',
					caption: 'Prunus osculans',
					tint: '#f7e6ea'
				},
				{
					id: 'peony',
					name: 'Peony',
					url: '/menu-art/flower-peony.svg',
					caption: 'Paeonia rubens',
					tint: '#f8e4ea'
				},
				{
					id: 'lily',
					name: 'Lily',
					url: '/menu-art/flower-lily.svg',
					caption: 'Lilium lentum',
					tint: '#f5ece2'
				}
			]
		}
	},
	sampler: {
		id: 'sampler',
		name: 'Cross-stitch sampler',
		title: 'Home Is Where You Are',
		value: (n) => `${n}p`,
		valueKey: 'p',
		copy: [{ key: 'stitched', place: 'foot', text: '— stitched with love —' }],
		pictures: {
			label: 'Stitching',
			slots: ['bunny', 'flower', 'fox'],
			choices: [
				{ id: 'bunny', name: 'Bunny', url: '/menu-art/bunny.svg' },
				{ id: 'flower', name: 'Flower', url: '/menu-art/stitched-flower.svg' },
				{ id: 'fox', name: 'Fox', url: '/menu-art/fox.svg' },
				{ id: 'heart', name: 'Heart', url: '/menu-art/stitched-heart.svg' },
				{ id: 'house', name: 'House', url: '/menu-art/stitched-house.svg' },
				{ id: 'cat', name: 'Cat', url: '/menu-art/stitched-cat.svg' },
				{ id: 'bird', name: 'Bird', url: '/menu-art/stitched-bird.svg' },
				{ id: 'mushroom', name: 'Mushroom', url: '/menu-art/stitched-mushroom.svg' },
				{ id: 'strawberry', name: 'Strawberry', url: '/menu-art/stitched-strawberry.svg' }
			]
		}
	},
	toys: {
		id: 'toys',
		name: 'Toy chest',
		title: 'Toy Chest',
		value: (n) => `$${n}`,
		valueKey: '$',
		courseArt: {
			label: 'Toy',
			choices: [
				{ id: 'mask', name: 'Sleep mask', url: '/menu-art/toy-mask.svg' },
				{ id: 'cuffs', name: 'Cuffs', url: '/menu-art/toy-cuffs.svg' },
				{ id: 'wand', name: 'Wand', url: '/menu-art/toy-wand.svg' },
				{ id: 'candle', name: 'Candle', url: '/menu-art/toy-candle.svg' },
				{ id: 'rope', name: 'Rope', url: '/menu-art/toy-rope.svg' },
				{ id: 'beads', name: 'Anal beads', url: '/menu-art/toy-beads.svg' },
				{ id: 'dildo', name: 'Dildo', url: '/menu-art/toy-dildo.svg' },
				{ id: 'plug', name: 'Jewelled plug', url: '/menu-art/toy-plug.svg' }
			]
		}
	}
};

/** The longest any of a design's copy can be rewritten to. */
export const MAX_MENU_COPY = 200;

/** What a new menu looks like, and what an unknown design reads as. */
export const DEFAULT_MENU_DESIGN: MenuDesignId = 'fine';

export function isMenuDesignId(value: unknown): value is MenuDesignId {
	return typeof value === 'string' && (MENU_DESIGN_IDS as readonly string[]).includes(value);
}

export function menuDesign(id: string | null | undefined): MenuDesign {
	return isMenuDesignId(id) ? MENU_DESIGNS[id] : MENU_DESIGNS[DEFAULT_MENU_DESIGN];
}

/**
 * What a menu has rewritten of its designs' copy: per design, per copy key.
 * Only what differs from the design's own is kept.
 */
export type MenuCopyOverrides = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** A design's copy as a menu shows it: its own words where it has rewritten them. */
/**
 * A design's copy as shown: its words now, the design's own (`original`, a
 * placeholder for copy someone emptied), and whether they differ.
 */
export type ShownMenuCopy = MenuCopy & { original: string; changed: boolean };

export function menuCopy(design: MenuDesign, overrides: MenuCopyOverrides): ShownMenuCopy[] {
	const own = overrides[design.id] ?? {};
	return (design.copy ?? []).map((copy) => {
		const text = own[copy.key];
		return text === undefined
			? { ...copy, original: copy.text, changed: false }
			: { ...copy, text, original: copy.text, changed: true };
	});
}

/**
 * `overrides` with one copy rewritten, or put back to the design's (`null`,
 * or the design's own words). A new object, never a changed one: the menu
 * node's properties are synced by identity.
 */
export function withMenuCopy(
	overrides: MenuCopyOverrides,
	design: MenuDesign,
	key: string,
	text: string | null
): MenuCopyOverrides {
	const own = { ...overrides[design.id] };
	const original = design.copy?.find((copy) => copy.key === key)?.text;
	if (text === null || text === original) {
		delete own[key];
	} else {
		own[key] = text.slice(0, MAX_MENU_COPY);
	}
	const next = { ...overrides };
	if (Object.keys(own).length === 0) {
		delete next[design.id];
	} else {
		next[design.id] = own;
	}
	return next;
}

/**
 * The picture a course shows on `design`: its own choice there, or the
 * design's next in turn for the course's place (`index`, from 0). Null for
 * a design whose courses have none.
 */
export function courseArtFor(
	design: MenuDesign,
	chosen: Readonly<Record<string, string>>,
	index: number
): MenuArtChoice | null {
	const choices = design.courseArt?.choices ?? [];
	if (choices.length === 0) {
		return null;
	}
	const own = choices.find((choice) => choice.id === chosen[design.id]);
	return own ?? choices[index % choices.length] ?? null;
}

/**
 * The mascot a menu shows on `design`: its own choice there, or the
 * design's first. Null for a design with none.
 */
export function mascotFor(
	design: MenuDesign,
	chosen: Readonly<Record<string, string>>
): MenuMascot | null {
	const choices = design.mascot?.choices ?? [];
	return choices.find((choice) => choice.id === chosen[design.id]) ?? choices[0] ?? null;
}

/** The title a menu with none of its own shows: its mascot's, or the design's. */
export function designTitle(design: MenuDesign, chosen: Readonly<Record<string, string>>): string {
	return mascotFor(design, chosen)?.title ?? design.title;
}

/** Stored choices per design (a menu's mascot, a course's picture), kept only where they are strings for a known design. */
export function chosenPerDesign(value: unknown): Record<string, string> {
	const chosen: Record<string, string> = {};
	if (typeof value === 'object' && value !== null) {
		for (const [design, choice] of Object.entries(value)) {
			if (isMenuDesignId(design) && typeof choice === 'string') {
				chosen[design] = choice;
			}
		}
	}
	return chosen;
}

/**
 * An item's number not yet set, as the design writes numbers: "$–" where a
 * set one reads "$4", "– treats" where it reads "4 treats". Written by the
 * design's own `value`, given a number every design writes as "NaN".
 */
export function unsetValue(design: MenuDesign): string {
	return design.value(Number.NaN).replace('NaN', '–');
}

/** What a menu has chosen for a design's row of pictures: per design, per place in the row. */
export type MenuPictureChoices = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * The pictures a menu shows in `design`'s row: its own choice for each
 * place, or the design's. Empty for a design with none.
 */
export function picturesFor(design: MenuDesign, chosen: MenuPictureChoices): MenuArtChoice[] {
	const { choices = [], slots = [] } = design.pictures ?? {};
	const own = chosen[design.id] ?? {};
	return slots.flatMap((fallback, place) => {
		const shown =
			choices.find((choice) => choice.id === own[String(place)]) ??
			choices.find((choice) => choice.id === fallback);
		return shown ? [shown] : [];
	});
}

/** A place in a row of pictures, as stored: its index. */
const PLACE = /^\d+$/;

/** Stored choices of a design's row of pictures, kept only where they are strings for a known design. */
export function pictureChoices(value: unknown): Record<string, Record<string, string>> {
	const chosen: Record<string, Record<string, string>> = {};
	if (typeof value === 'object' && value !== null) {
		for (const [design, places] of Object.entries(value)) {
			if (isMenuDesignId(design) && typeof places === 'object' && places !== null) {
				chosen[design] = Object.fromEntries(
					Object.entries(places).filter(
						(entry): entry is [string, string] =>
							PLACE.test(entry[0]) && typeof entry[1] === 'string'
					)
				);
			}
		}
	}
	return chosen;
}

/**
 * The custom properties a course's picture is drawn with (`--course-art`),
 * and what comes with it (`--course-caption`, a CSS string; `--course-tint`),
 * for the editor and a stored version alike. Each is there only when the
 * choice has it, so a design's own default shows otherwise.
 */
export function courseArtVars(choice: MenuArtChoice): Record<string, string> {
	return {
		'--course-art': `url('${choice.url}')`,
		...(choice.caption !== undefined && { '--course-caption': JSON.stringify(choice.caption) }),
		...(choice.tint !== undefined && { '--course-tint': choice.tint })
	};
}

/** `courseArtVars` as a `style` attribute. */
export function courseArtStyle(choice: MenuArtChoice | null): string | undefined {
	return choice
		? Object.entries(courseArtVars(choice))
				.map(([name, value]) => `${name}: ${value}`)
				.join('; ')
		: undefined;
}
