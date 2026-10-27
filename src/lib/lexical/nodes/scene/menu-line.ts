import {
	$applyNodeReplacement,
	// biome-ignore lint/suspicious/noDeprecatedImports: only the overload that takes a type argument is deprecated, and this calls the plain one.
	$getNodeByKey,
	type EditorConfig,
	ElementNode,
	type LexicalEditor,
	type LexicalNode,
	type LexicalUpdateJSON,
	type NodeKey,
	type RangeSelection,
	type SerializedElementNode,
	type Spread,
	setDOMUnmanaged
} from 'lexical';
import { isRating, isSurpriseFor, type MenuExtras, type MenuLineRole } from '$lib/scenes/blocks';
import { menuDesign, unsetValue } from '$lib/scenes/menu-designs';
import {
	drawLineCheck,
	drawLineExtras,
	LINE_CHECK_CLASS,
	LINE_EXTRAS_CLASS
} from '$lib/scenes/menu-frame';
import { $isMenuNode } from './menu';
import { canTick, drawSurprise, sceneViewerOf } from './viewer';

/**
 * A line of a scene's menu: a heading (which starts a course), a subheading,
 * or an item, with its rating and its number when the menu has them
 * (`MenuExtras`). See `./viewer` for how the scene nodes are built, and
 * docs/scenes.md, "Blocks".
 *
 * An item's rating and number sit at its right, in an element of their own
 * beside the line's words (its DOM slot), and are set by tapping them: each
 * asks for a new one through `MENU_EXTRA_EVENT`, which the scene's page
 * answers beside it.
 *
 * An item can also be a to-do (`checked` is not null): a box before its
 * words, likewise an element of its own, ticked by tapping it. See
 * docs/scenes.md, "To-do items".
 */

export type MenuItemProps = {
	/** Its place on the menu's scale, 1 to 5. */
	rating: number | null;
	/** Its number: a price, mostly, however the design writes it. */
	value: number | null;
	kinkId: string | null;
	/** Ticked or not, on an item that is a to-do; null on one that is not. */
	checked: boolean | null;
};

export type SerializedMenuLineNode = Spread<
	{ role: MenuLineRole; hiddenFrom: string | null } & MenuItemProps,
	SerializedElementNode
>;

/**
 * Sent from an item's rating or number when it is tapped, bubbling to the
 * editor's root, for the scene's page to ask for a new one beside it
 * (`MenuItemExtras.svelte`).
 */
export const MENU_EXTRA_EVENT = 'scene-menu-extra';

export type MenuExtraRequest = {
	/** The item's node. */
	key: string;
	extra: 'rating' | 'value';
	rating: number | null;
	value: number | null;
	/** What the rating or number means, as the menu's key says it; empty when unnamed. */
	label: string;
	/** The button tapped, to place the question beside. */
	anchor: HTMLElement;
};

export class MenuLineNode extends ElementNode {
	__role: MenuLineRole;
	__rating: number | null;
	__value: number | null;
	__kinkId: string | null;
	__hiddenFrom: string | null;
	__checked: boolean | null;

	static getType(): string {
		return 'scene-menu-line';
	}

	static clone(node: MenuLineNode): MenuLineNode {
		const clone = new MenuLineNode(node.__role, node.__key);
		clone.__rating = node.__rating;
		clone.__value = node.__value;
		clone.__kinkId = node.__kinkId;
		clone.__hiddenFrom = node.__hiddenFrom;
		clone.__checked = node.__checked;
		return clone;
	}

	static importJSON(serialised: SerializedMenuLineNode): MenuLineNode {
		return $createMenuLineNode(
			serialised.role === 'heading' || serialised.role === 'subheading' ? serialised.role : 'item'
		).updateFromJSON(serialised);
	}

	constructor(role: MenuLineRole = 'item', key?: NodeKey) {
		super(key);
		this.__role = role;
		this.__rating = null;
		this.__value = null;
		this.__kinkId = null;
		this.__hiddenFrom = null;
		this.__checked = null;
	}

	override updateFromJSON(serialised: LexicalUpdateJSON<SerializedMenuLineNode>): this {
		return super.updateFromJSON(serialised).setItemProps({
			rating: isRating(serialised.rating) ? serialised.rating : null,
			value: Number.isFinite(serialised.value) ? serialised.value : null,
			kinkId: typeof serialised.kinkId === 'string' ? serialised.kinkId : null,
			hiddenFrom: typeof serialised.hiddenFrom === 'string' ? serialised.hiddenFrom : null,
			checked: typeof serialised.checked === 'boolean' ? serialised.checked : null
		});
	}

	createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
		const element = document.createElement('div');
		const check = document.createElement('button');
		check.type = 'button';
		check.className = LINE_CHECK_CLASS;
		check.contentEditable = 'false';
		// Painted outside Lexical's reconciling, like the extras.
		setDOMUnmanaged(check);
		const words = document.createElement('span');
		words.className = 'menu-line-words';
		const extras = document.createElement('span');
		extras.className = LINE_EXTRAS_CLASS;
		extras.contentEditable = 'false';
		// Redrawn outside an update when the menu changes (`redraw`), which
		// Lexical would otherwise undo as DOM it did not make.
		setDOMUnmanaged(extras);
		element.append(check, words, extras);
		listenForExtras(element, this.__key, editor);
		listenForCheck(element, this.__key, editor);
		this.#paint(element, sceneViewerOf(editor));
		return element;
	}

	/** The words go in their own element, between the box and the rating and number. */
	override getDOMSlot(element: HTMLElement) {
		const words = element.querySelector(':scope > .menu-line-words');
		return words instanceof HTMLElement
			? super.getDOMSlot(element).withElement(words)
			: super.getDOMSlot(element);
	}

	updateDOM(previous: MenuLineNode, element: HTMLElement): boolean {
		// Painted in place rather than recreated: recreating a line under the
		// caret would move the caret. `updateDOM` is not given the editor, so
		// the viewer comes from the element, where `createDOM` left it.
		if (previous.__hiddenFrom !== this.__hiddenFrom) {
			return true;
		}
		this.#paint(element, element.dataset.viewer ?? null);
		return false;
	}

	/**
	 * Draws the line again from its menu: called when the menu's design or
	 * extras change, which changes nothing in the line itself. Inside a read
	 * of the editor's state.
	 */
	redraw(element: HTMLElement): void {
		this.#paint(element, element.dataset.viewer ?? null);
	}

	#paint(element: HTMLElement, viewerId: string | null): void {
		const surprise = isSurpriseFor(this.__hiddenFrom, viewerId);
		element.className = `scene-menu-line ${this.__role}`;
		const { design, extras } = this.#menu();
		const item = this.__role === 'item' && !surprise;
		const rated = item && extras.scale !== null;
		const valued = item && extras.value !== null;
		setData(element, 'rating', rated && this.__rating !== null ? String(this.__rating) : null);
		setData(element, 'value', valued && this.__value !== null ? String(this.__value) : null);
		const checkElement = element.querySelector<HTMLElement>(`:scope > .${LINE_CHECK_CLASS}`);
		if (checkElement) {
			drawLineCheck(checkElement, item ? this.__checked : null, this.getTextContent());
		}
		element.classList.toggle('checked', item && this.__checked === true);
		const extrasElement = element.querySelector<HTMLElement>(`:scope > .${LINE_EXTRAS_CLASS}`);
		if (extrasElement) {
			drawLineExtras(extrasElement, {
				...(rated && { rating: this.__rating }),
				...(valued && {
					value: this.__value === null ? null : menuDesign(design).value(this.__value),
					unset: unsetValue(menuDesign(design))
				}),
				controls: true
			});
		}
		if (viewerId) {
			element.dataset.viewer = viewerId;
		}
		drawSurprise(element, surprise);
		element.classList.toggle('only-me', this.__hiddenFrom !== null);
	}

	/**
	 * The menu this line is in: its design, which says how a number is
	 * written, and its extras, which say whether there is one at all. Read
	 * while the editor draws, when the tree is there to read.
	 */
	#menu(): { design: string | null; extras: MenuExtras } {
		try {
			const menu = this.getParent()?.getParent();
			if ($isMenuNode(menu)) {
				return { design: menu.__design, extras: { scale: menu.__scale, value: menu.__value } };
			}
		} catch {
			// Not in a tree yet: drawn again once it is.
		}
		return { design: null, extras: { scale: null, value: null } };
	}

	getRole(): MenuLineRole {
		return this.getLatest().__role;
	}

	setRole(role: MenuLineRole): this {
		const self = this.getWritable();
		self.__role = role;
		return self;
	}

	getItemProps(): MenuItemProps & { hiddenFrom: string | null } {
		const latest = this.getLatest();
		return {
			rating: latest.__rating,
			value: latest.__value,
			kinkId: latest.__kinkId,
			hiddenFrom: latest.__hiddenFrom,
			checked: latest.__checked
		};
	}

	setItemProps(props: Partial<MenuItemProps & { hiddenFrom: string | null }>): this {
		const self = this.getWritable();
		if (props.rating !== undefined) {
			self.__rating = props.rating;
		}
		if (props.value !== undefined) {
			self.__value = props.value;
		}
		if (props.kinkId !== undefined) {
			self.__kinkId = props.kinkId;
		}
		if (props.hiddenFrom !== undefined) {
			self.__hiddenFrom = props.hiddenFrom;
		}
		if (props.checked !== undefined) {
			self.__checked = props.checked;
		}
		return self;
	}

	getHiddenFrom(): string | null {
		return this.getLatest().__hiddenFrom;
	}

	setHiddenFrom(hiddenFrom: string | null): this {
		return this.setItemProps({ hiddenFrom });
	}

	getChecked(): boolean | null {
		return this.getLatest().__checked;
	}

	/** Ticks or unticks a to-do item, or makes an item one (a boolean) or not (null). */
	setChecked(checked: boolean | null): this {
		return this.setItemProps({ checked });
	}

	/**
	 * Enter makes another item, whatever this line is: a course is followed by
	 * what is in it. After a to-do item, the next is an unticked one, as in a
	 * to-do list.
	 */
	override insertNewAfter(_selection: RangeSelection, restoreSelection = true): MenuLineNode {
		const line = $createMenuLineNode('item');
		if (this.__role === 'item' && this.getChecked() !== null) {
			line.setChecked(false);
		}
		this.insertAfter(line, restoreSelection);
		return line;
	}

	override canIndent(): false {
		return false;
	}

	override exportJSON(): SerializedMenuLineNode {
		return {
			...super.exportJSON(),
			role: this.__role,
			rating: this.__rating,
			value: this.__value,
			kinkId: this.__kinkId,
			hiddenFrom: this.__hiddenFrom,
			checked: this.__checked
		};
	}
}

function setData(element: HTMLElement, name: string, value: string | null): void {
	if (value === null) {
		delete element.dataset[name];
	} else {
		element.dataset[name] = value;
	}
}

/**
 * Makes an item's rating and number answer a tap, by asking the page for a
 * new one. On the line's element rather than on each button, since they are
 * redrawn whenever the line is. A tap must not move the caret or take focus
 * from the page, so the press itself does nothing; and nothing is asked in
 * an editor that cannot be edited (a scene someone can only read).
 */
function listenForExtras(element: HTMLElement, key: NodeKey, editor: LexicalEditor): void {
	const control = (event: Event) =>
		event.target instanceof Element
			? event.target.closest<HTMLButtonElement>(`.${LINE_EXTRAS_CLASS} button[data-extra]`)
			: null;
	element.addEventListener('mousedown', (event) => {
		if (control(event)) {
			event.preventDefault();
		}
	});
	element.addEventListener('click', (event) => {
		const button = control(event);
		if (!(button && editor.isEditable())) {
			return;
		}
		event.preventDefault();
		const extra = button.dataset.extra === 'rating' ? 'rating' : 'value';
		const request = editor.getEditorState().read(() => {
			const line = $getNodeByKey(key);
			const menu = line?.getParent()?.getParent();
			if (!($isMenuLineNode(line) && $isMenuNode(menu))) {
				return null;
			}
			const { rating, value } = line.getItemProps();
			const names = menu.getExtras();
			return { rating, value, label: (extra === 'rating' ? names.scale : names.value) ?? '' };
		});
		if (request) {
			button.dispatchEvent(
				new CustomEvent<MenuExtraRequest>(MENU_EXTRA_EVENT, {
					bubbles: true,
					detail: { key, extra, ...request, anchor: button }
				})
			);
		}
	});
}

/**
 * Makes a to-do item's box tick when tapped, in an editor that can be edited
 * or whose to-dos can be ticked anyway (`setTickable`).
 * The press does nothing, so the caret stays where it was. On the line's
 * element rather than the box, as the extras are, since the box is redrawn
 * whenever the line is.
 */
function listenForCheck(element: HTMLElement, key: NodeKey, editor: LexicalEditor): void {
	const box = (event: Event) =>
		event.target instanceof Element ? event.target.closest(`.${LINE_CHECK_CLASS}`) : null;
	element.addEventListener('mousedown', (event) => {
		if (box(event)) {
			event.preventDefault();
		}
	});
	element.addEventListener('click', (event) => {
		if (!(box(event) && canTick(editor))) {
			return;
		}
		event.preventDefault();
		editor.update(() => {
			const line = $getNodeByKey(key);
			if ($isMenuLineNode(line) && line.getChecked() !== null) {
				line.setChecked(!line.getChecked());
			}
		});
	});
}

export function $createMenuLineNode(role: MenuLineRole = 'item'): MenuLineNode {
	return $applyNodeReplacement(new MenuLineNode(role));
}

export function $isMenuLineNode(node: LexicalNode | null | undefined): node is MenuLineNode {
	return node instanceof MenuLineNode;
}
