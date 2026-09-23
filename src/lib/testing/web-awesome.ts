/**
 * Reading Web Awesome elements in component tests.
 *
 * The component tests run in a real browser with the app's registrations
 * (`$lib/webawesome`), so every `wa-*` element is upgraded — and that changes
 * what a component leaves on it. Svelte assigns a custom element's *properties*
 * whenever the element has them, and it has them once it is defined. Lit then
 * reflects only some of those back to attributes, and only after its next
 * update. So `getAttribute('label')` reads null for a label the component set,
 * and a selector like `wa-button[type="submit"]` matches nothing (AGENTS.md
 * notes the same for Playwright).
 *
 * Read the property instead. It is what the component actually set, it is set
 * synchronously, and it is also what a value written as a static attribute in
 * the markup ends up as, so one accessor covers both.
 */

/** A property of a Web Awesome element, as the component set it. */
export function waProp(element: Element | null | undefined, name: string): unknown {
	if (!element) {
		return undefined;
	}
	return (element as unknown as Record<string, unknown>)[name];
}

/** Every element under `root` matching `selector` whose property `name` equals `value`. */
export function waByProp(
	root: ParentNode,
	selector: string,
	name: string,
	value: unknown
): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(selector)].filter(
		(element) => waProp(element, name) === value
	);
}

/**
 * The one `wa-button` of the given `type` under `root`.
 *
 * Throws rather than returning null, so a missing button fails at the lookup
 * with a message instead of later as "cannot read properties of null".
 */
export function waButtonOfType(root: ParentNode, type: 'submit' | 'button'): HTMLElement {
	const [button, ...rest] = waByProp(root, 'wa-button', 'type', type);
	if (!button) {
		throw new Error(`expected a wa-button of type "${type}"`);
	}
	if (rest.length > 0) {
		throw new Error(`expected one wa-button of type "${type}", found several`);
	}
	return button;
}

/**
 * Resolves once every Web Awesome element under `root` has finished rendering.
 *
 * Lit renders — and a form-associated element hands its value to the form —
 * in an update a microtask after the component sets its properties, not
 * during render. Anything that reads the result (a shadow root's contents, a
 * form's FormData, a reflected attribute) has to wait for this first.
 */
export async function waSettled(root: ParentNode): Promise<void> {
	await Promise.all(
		[...root.querySelectorAll('*')]
			.filter((element) => element.localName.startsWith('wa-'))
			.map(
				(element) => (element as unknown as { updateComplete?: Promise<unknown> }).updateComplete
			)
	);
}

/**
 * Whether a `fetch` was `wa-icon` loading its SVG.
 *
 * The components are installed from npm, but the icons are not: `wa-icon`
 * fetches each one from Font Awesome's kit CDN at runtime. A test that stubs
 * `fetch` to assert a component made no request of its own sees those too, so
 * it filters them out with this.
 */
export function isWaIconRequest(input: unknown): boolean {
	const url = input instanceof Request ? input.url : String(input);
	return new URL(url, globalThis.location.href).hostname.endsWith('fontawesome.com');
}
