import {
	$applyNodeReplacement,
	type EditorConfig,
	ElementNode,
	type LexicalNode,
	type LexicalUpdateJSON,
	type NodeKey,
	type SerializedElementNode,
	type Spread,
	setDOMUnmanaged
} from 'lexical';
import {
	chosenPerDesign,
	courseArtFor,
	courseArtVars,
	type MenuArtChoice,
	type MenuDesignId,
	menuDesign
} from '$lib/scenes/menu-designs';
import { $isMenuNode } from './menu';

/**
 * A course of a scene's menu: its heading (a `MenuLineNode` with the role
 * `course`) and the items under it. Its own node so that a design can set
 * each course apart, in a box or a column of its own, which a flat list of
 * lines could not be. A course with no heading is allowed: lines made into a
 * menu start as one. See `./viewer` for how the scene nodes are built, and
 * docs/scenes.md, "Blocks".
 *
 * A shadow root, like the menu: Enter and the caret treat each course as a
 * small document of its own, so an item added stays in its course.
 *
 * On a design whose courses each have a picture (`MenuDesign.courseArt`, the
 * toy chest's toys), the course draws it as a button after its lines, which
 * asks for another (`scene-blocks.ts`); what is chosen is kept here, per
 * design (`art`), so another design never shows it.
 */
export type SerializedMenuCourseNode = Spread<
	{ art: Readonly<Record<string, string>> },
	SerializedElementNode
>;

/** The class of a course's picture, a button in the editor. */
export const COURSE_ART_CLASS = 'menu-course-art';

/**
 * Sent from a course's picture, or a menu's mascot, when it is tapped,
 * bubbling to the editor's root, for the scene's page to offer the others
 * (`MenuArtPicker.svelte`).
 */
export const MENU_ART_EVENT = 'scene-menu-art';

export type MenuArtRequest = {
	/** A course's picture, the menu's mascot (`MenuDesign.mascot`), or one of its row of pictures. */
	kind: 'course' | 'mascot' | 'picture';
	/** For one of a row of pictures, its place in the row. */
	place?: number;
	/** The course's node, or the menu's for its mascot. */
	key: string;
	design: MenuDesignId;
	/** The picture it shows now. */
	current: string;
	label: string;
	choices: readonly MenuArtChoice[];
	/** The picture tapped, to place the question beside. */
	anchor: HTMLElement;
};

export class MenuCourseNode extends ElementNode {
	/** The picture chosen for this course, per design id. */
	__art: Readonly<Record<string, string>>;

	static getType(): string {
		return 'scene-menu-course';
	}

	static clone(node: MenuCourseNode): MenuCourseNode {
		const clone = new MenuCourseNode(node.__key);
		clone.__art = node.__art;
		return clone;
	}

	static importJSON(serialised: SerializedMenuCourseNode): MenuCourseNode {
		return $createMenuCourseNode().updateFromJSON(serialised);
	}

	constructor(key?: NodeKey) {
		super(key);
		this.__art = {};
	}

	override updateFromJSON(serialised: LexicalUpdateJSON<SerializedMenuCourseNode>): this {
		return super.updateFromJSON(serialised).setArt(chosenPerDesign(serialised.art));
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const element = document.createElement('div');
		element.className = 'scene-menu-course';
		const design = this.#design();
		if (design?.courseArt) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = COURSE_ART_CLASS;
			button.contentEditable = 'false';
			// Drawn here, not by Lexical: its lines go before it (`getDOMSlot`).
			setDOMUnmanaged(button);
			element.append(button);
			this.redrawArt(element);
		}
		return element;
	}

	/** Its lines go before its picture, when it has one. */
	override getDOMSlot(element: HTMLElement) {
		const art = element.querySelector<HTMLElement>(`:scope > .${COURSE_ART_CLASS}`);
		return art ? super.getDOMSlot(element).withBefore(art) : super.getDOMSlot(element);
	}

	updateDOM(previous: MenuCourseNode, element: HTMLElement): boolean {
		if (previous.__art !== this.__art) {
			this.redrawArt(element);
		}
		return false;
	}

	/**
	 * Draws the picture the course shows now: its own choice, or the next in
	 * turn for its place, which moves as courses come and go, so the menu
	 * redraws its courses' pictures whenever it changes (`scene-blocks.ts`).
	 * Inside a read of the editor's state.
	 */
	redrawArt(element: HTMLElement): void {
		const button = element.querySelector<HTMLElement>(`:scope > .${COURSE_ART_CLASS}`);
		const design = this.#design();
		const shown = design ? courseArtFor(design, this.__art, this.#index()) : null;
		if (!(button && design?.courseArt && shown)) {
			return;
		}
		for (const name of ['--course-caption', '--course-tint']) {
			element.style.removeProperty(name);
		}
		for (const [name, value] of Object.entries(courseArtVars(shown))) {
			element.style.setProperty(name, value);
		}
		button.dataset.art = shown.id;
		button.setAttribute(
			'aria-label',
			`${shown.name}. Choose another ${design.courseArt.label.toLowerCase()}`
		);
	}

	#design() {
		try {
			const menu = this.getParent();
			return $isMenuNode(menu) ? menuDesign(menu.__design) : null;
		} catch {
			// Not in a tree yet: drawn again once it is.
			return null;
		}
	}

	#index(): number {
		try {
			return this.getIndexWithinParent();
		} catch {
			return 0;
		}
	}

	getArt(): Readonly<Record<string, string>> {
		return this.getLatest().__art;
	}

	/** Replaces its chosen pictures, whole: synced by identity. */
	setArt(art: Readonly<Record<string, string>>): this {
		const self = this.getWritable();
		self.__art = art;
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

	override exportJSON(): SerializedMenuCourseNode {
		return { ...super.exportJSON(), art: this.__art };
	}
}

export function $createMenuCourseNode(): MenuCourseNode {
	return $applyNodeReplacement(new MenuCourseNode());
}

export function $isMenuCourseNode(node: LexicalNode | null | undefined): node is MenuCourseNode {
	return node instanceof MenuCourseNode;
}
