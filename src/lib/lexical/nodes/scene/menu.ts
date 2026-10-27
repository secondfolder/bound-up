import {
	$applyNodeReplacement,
	type DOMExportOutput,
	type EditorConfig,
	ElementNode,
	type LexicalEditor,
	type LexicalNode,
	type LexicalUpdateJSON,
	type NodeKey,
	type SerializedElementNode,
	type Spread,
	setDOMUnmanaged
} from 'lexical';
import {
	isSurpriseFor,
	MAX_EXTRA_LABEL,
	MAX_MENU_SUBTITLE,
	MAX_MENU_TITLE,
	type MenuExtras,
	type MenuHeading
} from '$lib/scenes/blocks';
import { markBraceletLines } from '$lib/scenes/bracelet';
import { CONFETTI_CLASS, keepConfetti } from '$lib/scenes/confetti';
import {
	chosenPerDesign,
	DEFAULT_MENU_DESIGN,
	designTitle,
	isMenuDesignId,
	MAX_MENU_COPY,
	type MenuCopyOverrides,
	type MenuDesignId,
	type MenuPictureChoices,
	mascotFor,
	menuCopy,
	menuDesign,
	pictureChoices,
	picturesFor
} from '$lib/scenes/menu-designs';
import {
	ADD_COURSE_CLASS,
	buildMenuFrame,
	coursesOf,
	drawMenuCopy,
	drawMenuHeading,
	drawMenuKey,
	drawMenuMascot,
	drawMenuPictures,
	type MenuKey,
	type ShownMascot,
	type ShownPictures
} from '$lib/scenes/menu-frame';
import { playWhilePointedAt } from '$lib/scenes/play-on-hover';
import { SPINNERS_CLASS, spinWhenSwept } from '$lib/scenes/spinners';
import { drawSurprise, sceneViewerOf } from './viewer';

/**
 * A scene's menu: courses (`./menu-course`), each a heading and the items
 * under it (`./menu-line`), drawn in one of the menu designs
 * (`$lib/scenes/menu-designs`). See `./viewer` for how the scene nodes are
 * built, and docs/scenes.md, "Blocks".
 */

export type SerializedMenuNode = Spread<
	{
		/** Its link's handle (`menuId`); absent on a menu from before links. */
		id?: string | null;
		title: string;
		subtitle: string;
		hiddenFrom: string | null;
		design: MenuDesignId;
		scale: string | null;
		value: string | null;
		copy: MenuCopyOverrides;
		mascot: Readonly<Record<string, string>>;
		pictures: MenuPictureChoices;
	},
	SerializedElementNode
>;

export class MenuNode extends ElementNode {
	/**
	 * What its own page is found by (docs/scenes.md, "A menu's own page").
	 * Lexical's node keys are made afresh on every load, so a link needs one
	 * of its own, kept with the menu. Null on a menu from before links until a
	 * writer opens the scene, when `scene-blocks.ts` gives it one.
	 */
	__menuId: string | null;
	/** Its own title, in place of the design's; empty for the design's. */
	__title: string;
	/** A line under the title; empty for none. */
	__subtitle: string;
	__hiddenFrom: string | null;
	__design: MenuDesignId;
	/** The scale's name, or null when items are not rated (`MenuExtras`). */
	__scale: string | null;
	/** What an item's number means, or null when items have none. */
	__value: string | null;
	/** What it has rewritten of its designs' copy, per design (`menuCopy`). */
	__copy: MenuCopyOverrides;
	/** The mascot chosen, per design (`mascotFor`). */
	__mascot: Readonly<Record<string, string>>;
	/** The pictures chosen for a design's row, per design and place (`picturesFor`). */
	__pictures: MenuPictureChoices;

	static getType(): string {
		return 'scene-menu';
	}

	static clone(node: MenuNode): MenuNode {
		const clone = new MenuNode(node.__hiddenFrom, node.__key);
		clone.__menuId = node.__menuId;
		clone.__title = node.__title;
		clone.__subtitle = node.__subtitle;
		clone.__design = node.__design;
		clone.__scale = node.__scale;
		clone.__value = node.__value;
		clone.__copy = node.__copy;
		clone.__mascot = node.__mascot;
		clone.__pictures = node.__pictures;
		return clone;
	}

	static importJSON(serialised: SerializedMenuNode): MenuNode {
		return $createMenuNode().updateFromJSON(serialised);
	}

	constructor(hiddenFrom: string | null = null, key?: NodeKey) {
		super(key);
		// Not made here: a node Yjs builds from another writer's document is
		// made by this constructor too, and an id invented on each device
		// would differ from device to device. `$createMenuNode` makes one.
		this.__menuId = null;
		this.__title = '';
		this.__subtitle = '';
		this.__hiddenFrom = hiddenFrom;
		this.__design = DEFAULT_MENU_DESIGN;
		this.__scale = null;
		this.__value = null;
		this.__copy = {};
		this.__mascot = {};
		this.__pictures = {};
	}

	override updateFromJSON(serialised: LexicalUpdateJSON<SerializedMenuNode>): this {
		return super
			.updateFromJSON(serialised)
			.setMenuId(typeof serialised.id === 'string' ? serialised.id : null)
			.setHeading({
				title: cut(serialised.title, MAX_MENU_TITLE) ?? '',
				subtitle: cut(serialised.subtitle, MAX_MENU_SUBTITLE) ?? ''
			})
			.setDesign(isMenuDesignId(serialised.design) ? serialised.design : DEFAULT_MENU_DESIGN)
			.setHiddenFrom(typeof serialised.hiddenFrom === 'string' ? serialised.hiddenFrom : null)
			.setExtras({
				scale: cut(serialised.scale, MAX_EXTRA_LABEL),
				value: cut(serialised.value, MAX_EXTRA_LABEL)
			})
			.setCopy(copyOverrides(serialised.copy))
			.setMascot(chosenPerDesign(serialised.mascot))
			.setPictures(pictureChoices(serialised.pictures));
	}

	createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
		const element = document.createElement('div');
		const surprise = isSurpriseFor(this.__hiddenFrom, sceneViewerOf(editor));
		const design = menuDesign(this.__design);
		// The design's look is `menu-designs.css`, keyed by the class, drawn on
		// the frame. A surprise has none: the partner sees only that there is
		// something.
		element.className = surprise
			? 'scene-block scene-menu'
			: `scene-block scene-menu design-${design.id}`;
		element.dataset.design = design.id;
		drawMenuId(element, this.__menuId);
		const courses = buildMenuFrame(element, {
			...this.#heading(),
			key: this.#key(),
			copy: menuCopy(design, this.__copy),
			mascot: this.#mascot(),
			mascotButton: !surprise,
			pictures: this.#pictures(),
			titleLetters: design.titleLetters === true,
			subtitleBeads: design.subtitleBeads === true,
			spinners: design.spinners ?? 0,
			confetti: design.confetti === true
		});
		const subtitle = element.querySelector<HTMLElement>('.menu-subtitle');
		if (design.subtitleBeads && subtitle && !surprise) {
			// Stops itself once the menu is drawn afresh and this one goes.
			markBraceletLines(subtitle);
		}
		if (!surprise) {
			// Lives as long as the element: the listeners are on it alone.
			playWhilePointedAt(element);
		}
		const confetti = element.querySelector<HTMLElement>(`.${CONFETTI_CLASS}`);
		if (confetti && !surprise) {
			// Stops itself once the menu is drawn afresh and this one goes.
			keepConfetti(confetti);
		}
		if (design.spinners && !surprise) {
			// Lives as long as the element: the listeners are on it alone.
			spinWhenSwept(element);
		}
		// Only in the editor, and shown only while the caret is in the menu
		// (`caret-in`): a way to add a course that does not need knowing a
		// heading starts one. `scene-blocks.ts` answers it.
		const add = document.createElement('div');
		add.className = ADD_COURSE_CLASS;
		add.contentEditable = 'false';
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = 'Add a section';
		add.append(button);
		courses.after(add);
		// Also the editor's alone: puts rewritten copy back to the design's,
		// shown beside it while it is being edited (`scene-blocks.ts`).
		const reset = document.createElement('button');
		reset.type = 'button';
		reset.className = RESET_COPY_CLASS;
		reset.textContent = 'Reset';
		reset.popover = 'manual';
		element.append(reset);
		// And, in its corner while the caret is in it or it is pointed at, a
		// link to its own page and deleting the whole menu, words and all
		// (`scene-blocks.ts`): otherwise deleting takes selecting every line
		// of it and then the frame.
		const tools = document.createElement('div');
		tools.className = MENU_TOOLS_CLASS;
		tools.contentEditable = 'false';
		const link = document.createElement('button');
		link.type = 'button';
		link.className = MENU_LINK_CLASS;
		link.setAttribute('aria-label', 'Copy a link to this menu');
		link.title = 'Copy a link to this menu';
		const chain = document.createElement('wa-icon');
		chain.setAttribute('name', 'link');
		chain.setAttribute('aria-hidden', 'true');
		link.append(chain);
		const remove = document.createElement('button');
		remove.type = 'button';
		remove.className = DELETE_MENU_CLASS;
		remove.setAttribute('aria-label', 'Delete this menu');
		remove.title = 'Delete this menu';
		const bin = document.createElement('wa-icon');
		bin.setAttribute('name', 'trash-can');
		bin.setAttribute('aria-hidden', 'true');
		remove.append(bin);
		tools.append(link, remove);
		element.append(tools);
		// The frame is the menu's own, not its courses': Lexical leaves it be.
		for (const fixed of element.querySelectorAll<HTMLElement>(
			`.menu-filters, .${CONFETTI_CLASS}, .${SPINNERS_CLASS}, .menu-art, .menu-head, .menu-intro, .${ADD_COURSE_CLASS}, .menu-key, .menu-foot, .${RESET_COPY_CLASS}, .${MENU_TOOLS_CLASS}`
		)) {
			setDOMUnmanaged(fixed);
		}
		drawSurprise(element, surprise);
		element.classList.toggle('only-me', this.__hiddenFrom !== null);
		return element;
	}

	/** The courses go inside the frame, not after it. */
	override getDOMSlot(element: HTMLElement) {
		return super.getDOMSlot(element).withElement(coursesOf(element));
	}

	/**
	 * Copied out of the app as a bare container: the frame is the design's
	 * drawing, not anything someone wrote.
	 */
	override exportDOM(): DOMExportOutput {
		const element = document.createElement('div');
		element.className = 'scene-menu';
		return { element };
	}

	updateDOM(previous: MenuNode, element: HTMLElement): boolean {
		// The heading and the key are drawn in place: recreating the menu would
		// redraw every line in it, under the caret of whoever is writing there.
		if (previous.__hiddenFrom !== this.__hiddenFrom || previous.__design !== this.__design) {
			return true;
		}
		drawMenuHeading(element, this.#heading());
		drawMenuKey(element, this.#key());
		drawMenuCopy(element, menuCopy(menuDesign(this.__design), this.__copy));
		drawMenuMascot(element, this.#mascot());
		drawMenuPictures(element, this.#pictures());
		drawMenuId(element, this.__menuId);
		return false;
	}

	getMenuId(): string | null {
		return this.getLatest().__menuId;
	}

	setMenuId(menuId: string | null): this {
		const self = this.getWritable();
		self.__menuId = menuId;
		return self;
	}

	/** The pictures in its design's row, if the design has one. */
	#pictures(): ShownPictures | null {
		const design = menuDesign(this.__design);
		return design.pictures
			? { label: design.pictures.label, shown: picturesFor(design, this.__pictures) }
			: null;
	}

	getPictures(): MenuPictureChoices {
		return this.getLatest().__pictures;
	}

	/** Replaces its chosen pictures, whole: synced by identity. */
	setPictures(pictures: MenuPictureChoices): this {
		const self = this.getWritable();
		self.__pictures = pictures;
		return self;
	}

	/** The mascot it shows on its design, if the design has one. */
	#mascot(): ShownMascot | null {
		const design = menuDesign(this.__design);
		const mascot = mascotFor(design, this.__mascot);
		return mascot && design.mascot ? { ...mascot, label: design.mascot.label } : null;
	}

	getMascot(): Readonly<Record<string, string>> {
		return this.getLatest().__mascot;
	}

	/** Replaces its chosen mascots, whole: synced by identity. */
	setMascot(mascot: Readonly<Record<string, string>>): this {
		const self = this.getWritable();
		self.__mascot = mascot;
		return self;
	}

	/**
	 * The heading as drawn: the menu's own title and subtitle, or the design's
	 * where it has none (a design may have no subtitle, and then there is none).
	 */
	#heading(): MenuHeading {
		const design = menuDesign(this.__design);
		return {
			title: this.__title || designTitle(design, this.__mascot),
			subtitle: this.__subtitle || design.subtitle || ''
		};
	}

	getCopy(): MenuCopyOverrides {
		return this.getLatest().__copy;
	}

	/** Replaces what it has rewritten of its designs' copy, whole (`withMenuCopy`). */
	setCopy(copy: MenuCopyOverrides): this {
		const self = this.getWritable();
		self.__copy = copy;
		return self;
	}

	#key(): MenuKey {
		return {
			scale: this.__scale,
			value: this.__value,
			valueKey: menuDesign(this.__design).valueKey
		};
	}

	getExtras(): MenuExtras {
		const latest = this.getLatest();
		return { scale: latest.__scale, value: latest.__value };
	}

	setExtras(extras: Partial<MenuExtras>): this {
		const self = this.getWritable();
		if (extras.scale !== undefined) {
			self.__scale = extras.scale;
		}
		if (extras.value !== undefined) {
			self.__value = extras.value;
		}
		return self;
	}

	getDesign(): MenuDesignId {
		return this.getLatest().__design;
	}

	setDesign(design: MenuDesignId): this {
		const self = this.getWritable();
		self.__design = design;
		return self;
	}

	/** The menu's own title and subtitle, each empty when it has none. */
	getHeading(): MenuHeading {
		const latest = this.getLatest();
		return { title: latest.__title, subtitle: latest.__subtitle };
	}

	setHeading(heading: Partial<MenuHeading>): this {
		const self = this.getWritable();
		if (heading.title !== undefined) {
			self.__title = heading.title;
		}
		if (heading.subtitle !== undefined) {
			self.__subtitle = heading.subtitle;
		}
		return self;
	}

	getHiddenFrom(): string | null {
		return this.getLatest().__hiddenFrom;
	}

	setHiddenFrom(hiddenFrom: string | null): this {
		const self = this.getWritable();
		self.__hiddenFrom = hiddenFrom;
		return self;
	}

	override isShadowRoot(): boolean {
		return true;
	}

	override canBeEmpty(): false {
		return false;
	}

	override canIndent(): false {
		return false;
	}

	override exportJSON(): SerializedMenuNode {
		return {
			...super.exportJSON(),
			id: this.__menuId,
			title: this.__title,
			subtitle: this.__subtitle,
			hiddenFrom: this.__hiddenFrom,
			design: this.__design,
			scale: this.__scale,
			value: this.__value,
			copy: this.__copy,
			mascot: this.__mascot,
			pictures: this.__pictures
		};
	}
}

/** The class of the editor's button that puts rewritten copy back to the design's. */
export const RESET_COPY_CLASS = 'menu-copy-reset';

/** The class of the editor's button that deletes the whole menu. */
export const DELETE_MENU_CLASS = 'menu-delete';

/** The class of the editor's button that offers a link to the menu's own page. */
export const MENU_LINK_CLASS = 'menu-link';

/** The class of the corner holding the link and delete buttons. */
export const MENU_TOOLS_CLASS = 'menu-tools';

/**
 * Asks for the link popover (`MenuLinkPopover.svelte`), dispatched on the
 * editor's root when a menu's link button is pressed.
 */
export const MENU_LINK_EVENT = 'scene-menu-link';

export type MenuLinkRequest = {
	menuId: string;
	/** The button pressed, for the popover to point at. */
	anchor: HTMLElement;
};

/** Marks the menu's element with its id, for its page to find and its link to name. */
function drawMenuId(element: HTMLElement, menuId: string | null) {
	if (menuId) {
		element.dataset.menuId = menuId;
	} else {
		delete element.dataset.menuId;
	}
}

/** Stored copy, kept only where it is a design's and a key's strings. */
function copyOverrides(value: unknown): MenuCopyOverrides {
	const copy: Record<string, Record<string, string>> = {};
	if (typeof value !== 'object' || value === null) {
		return copy;
	}
	for (const [design, keys] of Object.entries(value)) {
		if (!isMenuDesignId(design) || typeof keys !== 'object' || keys === null) {
			continue;
		}
		const own: Record<string, string> = {};
		for (const [key, text] of Object.entries(keys)) {
			if (typeof text === 'string') {
				own[key] = text.slice(0, MAX_MENU_COPY);
			}
		}
		copy[design] = own;
	}
	return copy;
}

/** A stored string cut to length, or null when it is not one. */
function cut(value: unknown, length: number): string | null {
	return typeof value === 'string' ? value.slice(0, length) : null;
}

export function $createMenuNode(hiddenFrom: string | null = null): MenuNode {
	const node = new MenuNode(hiddenFrom);
	node.__menuId = crypto.randomUUID();
	return $applyNodeReplacement(node);
}

export function $isMenuNode(node: LexicalNode | null | undefined): node is MenuNode {
	return node instanceof MenuNode;
}
