/**
 * The frame every scene menu is drawn in, around the courses someone writes:
 * the same elements for every design, so a design is only CSS
 * (`menu-designs.css`) that paints them. Built here for the editor (the
 * menu node's `createDOM`) and drawn by `MenuFrame.svelte` for a stored
 * version, which a test holds to the same shape. See docs/scenes.md, "Menu
 * designs".
 *
 *   .scene-menu                  the menu: the table, desk or wall it lies on
 *     svg.menu-filters           the chalk filters, below
 *     .menu-sheet                the card, slate, page or board itself
 *       .menu-art > i × ART_PIECES  drawings over the sheet, placed by each design
 *       .menu-head               the menu's heading
 *         .menu-mascot           the design's mascot, on a design with one
 *         .menu-pictures         a row of pictures (`.menu-picture`), on a design with one
 *         .menu-title            its title: the menu's own, or the design's
 *         .menu-subtitle         a line under it, when the menu has one
 *         .menu-note             holding any of the design's copy placed there
 *       .menu-intro              any of the design's copy before the courses
 *       .scene-menu-courses      the courses: what Lexical edits
 *       .menu-add-course         in the editor only, "Add a section"
 *       .menu-key                what a rating and a number mean, when the menu has them
 *         .menu-key-scale        a mark of the rating (`.menu-rate.on`) and the scale's name
 *         .menu-key-value        the number's mark (`.menu-key-mark`) and what it means
 *       .menu-foot               any words of the design's own, after
 *
 * None of it is text Lexical edits (`contenteditable="false"`). A design's
 * own words are its copy (`MenuCopy`, as shown `ShownMenuCopy`), each a `.menu-copy` span with its
 * `data-copy` key, put in the place the design names (the heading, its
 * note, the intro, the foot or a drawing): real text, so that it can be
 * rewritten on the menu (`scene-blocks.ts`), as the title and subtitle can.
 * Anything else a design adds (a mark, a numbering) is generated content in
 * its CSS.
 *
 * Alias-free and pure: it is handed the document it builds in.
 */

import { MAX_RATING } from './blocks';
import {
	copyFields,
	type MenuArtChoice,
	type MenuMascot,
	type ShownMenuCopy
} from './menu-designs';

/** How many drawings a design can place over its sheet, each with `::before` and `::after`. */
export const ART_PIECES = 8;

/** What a menu's key says: each entry is shown only when it has a name. */
export type MenuKey = {
	/** The scale's name, or null when items are not rated. */
	scale: string | null;
	/** What an item's number means, or null when items have none. */
	value: string | null;
	/** The design's mark for a number: "$". */
	valueKey: string;
};

/** The class of the element the courses go in, which Lexical treats as the menu's own. */
export const COURSES_CLASS = 'scene-menu-courses';

/**
 * The class of the editor's "Add a section" button, after the courses: the
 * editor's alone, so not part of the frame a stored version draws.
 */
export const ADD_COURSE_CLASS = 'menu-add-course';

/**
 * Chalk for the slate design: grain cut out of each stroke, and the edges
 * roughened, for the drawings; a lighter grain and no wobble for the
 * writing, so it stays readable. A CSS `filter: url(#…)` reaches only a
 * filter in the same document, so it travels in the frame (Chromium ignores
 * one in a file or a data URL). Every chalk menu on a page repeats the same
 * ids with the same filters, so whichever one is found is right.
 */
export const MENU_FILTERS = `<filter id="menu-chalk-drawn" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.6 0 0 0 1.95" result="holes"/><feComposite in="SourceGraphic" in2="holes" operator="in" result="grainy"/><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="9" result="wobble"/><feDisplacementMap in="grainy" in2="wobble" scale="2.4" xChannelSelector="R" yChannelSelector="G"/></filter><filter id="menu-chalk-written" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="3" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.9 0 0 0 1.8" result="holes"/><feComposite in="SourceGraphic" in2="holes" operator="in"/></filter>`;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds a menu's frame into `menu`, and returns the element its courses go
 * in. `menu` keeps whatever classes and attributes its caller gave it.
 */
export function buildMenuFrame(
	menu: HTMLElement,
	{
		title,
		subtitle,
		key,
		copy,
		mascot = null,
		mascotButton = false,
		pictures = null
	}: {
		title: string;
		subtitle: string;
		key: MenuKey;
		copy: readonly ShownMenuCopy[];
		/** The design's mascot as the menu has it (`mascotFor`), if the design has one. */
		mascot?: ShownMascot | null;
		/** The mascot as a button, in the editor, which offers the others. */
		mascotButton?: boolean;
		/** The design's row of pictures as the menu has it (`picturesFor`), if it has one. */
		pictures?: ShownPictures | null;
	}
): HTMLElement {
	const doc = menu.ownerDocument;
	const element = (tag: string, className: string, text?: string) => {
		const made = doc.createElement(tag);
		made.className = className;
		if (text !== undefined) {
			made.textContent = text;
		}
		return made;
	};
	const fixed = (made: HTMLElement) => {
		made.contentEditable = 'false';
		return made;
	};

	const art = fixed(element('span', 'menu-art'));
	for (let piece = 0; piece < ART_PIECES; piece += 1) {
		art.append(doc.createElement('i'));
	}
	const filters = doc.createElementNS(SVG_NS, 'svg');
	filters.setAttribute('class', 'menu-filters');
	filters.setAttribute('aria-hidden', 'true');
	filters.innerHTML = MENU_FILTERS;

	const head = fixed(element('div', 'menu-head'));
	const note = element('span', 'menu-note');
	if (mascot) {
		const drawn = element(mascotButton ? 'button' : 'span', MASCOT_CLASS);
		if (drawn instanceof HTMLButtonElement) {
			drawn.type = 'button';
		} else {
			drawn.setAttribute('role', 'img');
		}
		head.append(drawn);
	}
	if (pictures) {
		const row = element('span', PICTURES_CLASS);
		for (const _ of pictures.shown) {
			const drawn = element(mascotButton ? 'button' : 'span', PICTURE_CLASS);
			if (drawn instanceof HTMLButtonElement) {
				drawn.type = 'button';
			} else {
				drawn.setAttribute('role', 'img');
			}
			row.append(drawn);
		}
		head.append(row);
	}
	head.append(
		element('span', 'menu-title', title),
		element('span', 'menu-subtitle', subtitle),
		note
	);
	const intro = fixed(element('div', 'menu-intro'));
	const courses = element('div', COURSES_CLASS);
	const scale = element('span', 'menu-key-scale');
	scale.append(element('i', 'menu-rate on'), element('span', 'menu-key-label'));
	const value = element('span', 'menu-key-value');
	value.append(element('b', 'menu-key-mark'), element('span', 'menu-key-label'));
	const keyElement = fixed(element('div', 'menu-key'));
	keyElement.append(scale, value);
	const foot = fixed(element('div', 'menu-foot'));

	const places: Record<string, HTMLElement | undefined> = { head, note, intro, foot };
	for (const [index, piece] of [...art.children].entries()) {
		places[`art${index + 1}`] = piece as HTMLElement;
	}
	for (const { key: copyKey, place, text, original, fields, oneLine } of copy) {
		const words = element('span', 'menu-copy');
		words.dataset.copy = copyKey;
		words.dataset.placeholder = original;
		if (fields) {
			words.dataset.fields = '';
		}
		if (oneLine) {
			words.dataset.oneLine = '';
		}
		fillCopy(words, text);
		places[place]?.append(words);
	}

	const sheet = element('div', 'menu-sheet');
	sheet.append(art, head, intro, courses, keyElement, foot);
	menu.append(filters, sheet);
	drawMenuKey(menu, key);
	drawMenuMascot(menu, mascot);
	drawMenuPictures(menu, pictures);
	return courses;
}

/** The classes of a design's row of pictures in the heading (`MenuDesign.pictures`), and of each. */
export const PICTURES_CLASS = 'menu-pictures';
export const PICTURE_CLASS = 'menu-picture';

/** A design's row of pictures as a menu shows it, and what the design calls one. */
export type ShownPictures = { label: string; shown: readonly MenuArtChoice[] };

/** Shows the pictures the menu has now, in place, as `drawMenuMascot` does its mascot. */
export function drawMenuPictures(menu: HTMLElement, pictures: ShownPictures | null): void {
	const drawn = menu.querySelectorAll<HTMLElement>(`.${PICTURE_CLASS}`);
	for (const [place, picture] of [...drawn].entries()) {
		const shown = pictures?.shown[place];
		if (!(shown && pictures)) {
			continue;
		}
		picture.dataset.art = shown.id;
		picture.dataset.place = String(place);
		picture.style.setProperty('--picture', `url('${shown.url}')`);
		picture.setAttribute(
			'aria-label',
			picture.localName === 'button'
				? `${shown.name}. Choose another ${pictures.label.toLowerCase()}`
				: shown.name
		);
	}
}

/** The class of a design's mascot in the menu's heading (`MenuDesign.mascot`). */
export const MASCOT_CLASS = 'menu-mascot';

/** A design's mascot as a menu shows it, and what the design calls one ("Pet"). */
export type ShownMascot = MenuMascot & { label: string };

/**
 * Shows the mascot the menu has now, in place: its picture, its name, and
 * on the menu itself its id (`data-mascot`), for the design to dress the
 * rest of the menu to match. A button's name says it can be changed.
 */
export function drawMenuMascot(menu: HTMLElement, mascot: ShownMascot | null): void {
	const drawn = menu.querySelector<HTMLElement>(`.${MASCOT_CLASS}`);
	if (!(drawn && mascot)) {
		delete menu.dataset.mascot;
		return;
	}
	menu.dataset.mascot = mascot.id;
	drawn.dataset.art = mascot.id;
	drawn.style.setProperty('--mascot', `url('${mascot.url}')`);
	drawn.setAttribute(
		'aria-label',
		drawn.localName === 'button'
			? `${mascot.name}. Choose another ${mascot.label.toLowerCase()}`
			: mascot.name
	);
}

/** Shows what the menu's key says now, in place. */
export function drawMenuKey(menu: HTMLElement, key: MenuKey): void {
	const scale = menu.querySelector<HTMLElement>('.menu-key-scale');
	const value = menu.querySelector<HTMLElement>('.menu-key-value');
	if (!(scale && value)) {
		return;
	}
	// Not while its name is being typed in on the menu: emptied, it would
	// vanish under the caret. It goes once left.
	const typing = (entry: HTMLElement) => entry.contains(entry.ownerDocument.activeElement);
	scale.hidden = !((key.scale ?? '') || typing(scale));
	value.hidden = !((key.value ?? '') || typing(value));
	setText(scale, '.menu-key-label', key.scale ?? '');
	setText(value, '.menu-key-label', key.value ?? '');
	setText(value, '.menu-key-mark', key.valueKey);
	const keyElement = scale.parentElement;
	if (keyElement) {
		keyElement.hidden = scale.hidden && value.hidden;
	}
}

/** Shows the design's copy as the menu has it now, in place. */
export function drawMenuCopy(menu: HTMLElement, copy: readonly ShownMenuCopy[]): void {
	for (const { key, text } of copy) {
		const words = menu.querySelector<HTMLElement>(`.menu-copy[data-copy="${key}"]`);
		// Not while it is typed in, as `setText`.
		if (words && copyTextOf(words) !== text && words.ownerDocument.activeElement !== words) {
			fillCopy(words, text);
		}
	}
}

/** What holds an empty line of fields open (`fillCopy`): never part of the words. */
export const HOLD_OPEN = '\u200b';

/** The class of a line of copy that is fields (`MenuCopy.fields`), and of its two halves. */
export const COPY_LINE_CLASS = 'copy-line';

/**
 * Puts a copy's words in its element: as they are, or for copy that is
 * fields (`data-fields`), a `.copy-line` per line holding a `.copy-label`
 * and a `.copy-value`, for a design to print the one and handwrite the
 * other. Spans rather than the words alone because no selector reaches
 * part of a line; `MenuFrame.svelte` draws the same.
 */
export function fillCopy(words: HTMLElement, text: string): void {
	if (!('fields' in words.dataset) || text === '') {
		words.textContent = text;
		// A last line still empty, just started: a line break at the very end
		// draws nothing, so the caret would stay on the line before.
		if (text.endsWith('\n')) {
			words.append(words.ownerDocument.createElement('br'));
		}
		return;
	}
	const doc = words.ownerDocument;
	const span = (className: string, content: string) => {
		const made = doc.createElement('span');
		made.className = className;
		made.textContent = content;
		return made;
	};
	words.replaceChildren(
		...copyFields(text).map(({ label, value }) => {
			const line = span(COPY_LINE_CLASS, '');
			const labelled = span('copy-label', label);
			// An empty line has no text for a caret to sit in: the browser
			// moved one put there to the end of the line before, and beside a
			// lone <br> drew it well below the line. A zero-width space holds
			// it instead, which `copyTextOf` leaves out of the words.
			if (label === '' && value === '') {
				labelled.textContent = HOLD_OPEN;
			}
			line.append(labelled, span('copy-value', value));
			return line;
		})
	);
}

/**
 * What a copy's element says: its lines joined, for copy that is fields,
 * whose lines are elements rather than line breaks. Words typed outside
 * any line (the browser puts them there once every line is selected and
 * typed over) are a line of their own.
 */
export function copyTextOf(words: Node): string {
	const lines: string[] = [];
	let loose: string | null = null;
	for (const child of words.childNodes) {
		if (child instanceof Element && child.classList.contains(COPY_LINE_CLASS)) {
			if (loose !== null) {
				lines.push(loose);
				loose = null;
			}
			lines.push(child.textContent ?? '');
		} else {
			loose = (loose ?? '') + (child.textContent ?? '');
		}
	}
	if (loose !== null) {
		lines.push(loose);
	}
	return lines.join('\n').replaceAll(HOLD_OPEN, '');
}

/** Shows the menu's title and subtitle now, in place. */
export function drawMenuHeading(
	menu: HTMLElement,
	{ title, subtitle }: { title: string; subtitle: string }
): void {
	setText(menu, '.menu-title', title);
	setText(menu, '.menu-subtitle', subtitle);
}

/**
 * Sets an element's text, unless it already says it, or someone is typing in
 * it: what they have typed is already what it should say, and an empty one
 * is drawn as the design's when they leave it.
 */
function setText(within: HTMLElement, selector: string | null, text: string): void {
	const found = selector === null ? within : within.querySelector(selector);
	if (found && found.textContent !== text && found.ownerDocument.activeElement !== found) {
		found.textContent = text;
	}
}

/** The element `buildMenuFrame` put a menu's courses in. */
export function coursesOf(menu: HTMLElement): HTMLElement {
	const courses = menu.querySelector<HTMLElement>(`:scope > .menu-sheet > .${COURSES_CLASS}`);
	if (!courses) {
		throw new Error('A scene menu’s element has no frame: build it with buildMenuFrame.');
	}
	return courses;
}

/** What an item shows at its right: its rating and its number, when the menu has them. */
export type LineExtras = {
	/** The item's rating, when the menu has a scale; undefined when it has none. */
	rating?: number | null;
	/** The item's number as the design writes it, when the menu has one; undefined when it has none. */
	value?: string | null;
	/** An unset number as the design writes one ("$–", `unsetValue`); a bare dash if not given. */
	unset?: string;
	/**
	 * Buttons to set them with, in the editor; plain marks in a stored
	 * version, which shows an unset number as nothing at all.
	 */
	controls: boolean;
};

/** The class of the element holding an item's rating and number. */
export const LINE_EXTRAS_CLASS = 'menu-line-extras';

/**
 * Draws an item's rating and number into `extras`, the element at its
 * right. Every item of a rated menu shows the whole scale, set or not, in
 * the design's marks (`.menu-rate`, with `.on` up to the rating).
 *
 * In the editor each is one button, which asks for a new rating or number
 * beside it (`MenuItemExtras.svelte`). They are changed in place rather
 * than drawn afresh, because the question is anchored to the button it was
 * asked from, and the item is redrawn with every change it makes.
 */
export function drawLineExtras(extras: HTMLElement, line: LineExtras): void {
	const tag = line.controls ? 'button' : 'span';
	const rates = part(extras, 'menu-rates', tag, line.rating !== undefined, 'start');
	if (rates) {
		const rating = line.rating ?? null;
		const said = rating ? `${rating} out of ${MAX_RATING}` : 'Not rated';
		if (rates.childElementCount !== MAX_RATING) {
			rates.replaceChildren(
				...Array.from({ length: MAX_RATING }, () => rates.ownerDocument.createElement('i'))
			);
		}
		for (const [index, mark] of [...rates.children].entries()) {
			mark.className = index < (rating ?? 0) ? 'menu-rate on' : 'menu-rate';
		}
		if (line.controls) {
			setAttribute(rates, 'aria-label', rating ? `Rating: ${said}. Change it` : 'Rate this');
		} else {
			setAttribute(rates, 'role', 'img');
			setAttribute(rates, 'aria-label', said);
		}
	}
	const shown = line.value !== undefined && (line.controls || line.value !== null);
	const value = part(extras, 'menu-value', tag, shown, 'end');
	if (value) {
		const written = line.value ?? null;
		value.classList.toggle('unset', written === null);
		const text = written ?? line.unset ?? '–';
		if (value.textContent !== text) {
			value.textContent = text;
		}
		if (line.controls) {
			setAttribute(
				value,
				'aria-label',
				written === null ? 'Set a number' : `${written}. Change it`
			);
		}
	}
	extras.hidden = !(rates || value);
}

/**
 * The part of an item's extras with `className`: the one there, made if it
 * is wanted and missing (or the wrong element), or taken away if it is not.
 */
function part(
	extras: HTMLElement,
	className: string,
	tag: 'button' | 'span',
	wanted: boolean,
	at: 'start' | 'end'
): HTMLElement | null {
	const found = extras.querySelector<HTMLElement>(`:scope > .${className}`);
	if (found && (!wanted || found.localName !== tag)) {
		found.remove();
	} else if (found) {
		return found;
	}
	if (!wanted) {
		return null;
	}
	const made = extras.ownerDocument.createElement(tag);
	made.className = className;
	if (made instanceof HTMLButtonElement) {
		made.type = 'button';
		made.dataset.extra = className === 'menu-rates' ? 'rating' : 'value';
	}
	if (at === 'start') {
		extras.prepend(made);
	} else {
		extras.append(made);
	}
	return made;
}

function setAttribute(element: Element, name: string, value: string): void {
	if (element.getAttribute(name) !== value) {
		element.setAttribute(name, value);
	}
}
