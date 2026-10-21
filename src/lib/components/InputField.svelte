<script lang="ts" module>
	type T = Record<string, unknown>;
</script>

<script lang="ts" generics="T extends Record<string, unknown>">
	import type { Attachment } from 'svelte/attachments';
	import { type FormPathLeaves, formFieldProxy, type SuperForm } from 'sveltekit-superforms';

	let {
		superform,
		field,
		title,
		startText = null,
		type,
		...otherProps
	}: {
		superform: SuperForm<T>;
		field: FormPathLeaves<T>;
		title?: string;
		startText?: string | null;
		type: string;
		// Any further attributes are spread onto the underlying <wa-input>, which
		// is how callers pass things like `autocomplete`.
		[attribute: string]: unknown;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captures the initial `superform`/`field` on purpose: the proxies it
	// returns are the live stores, so re-deriving them per render would
	// rebuild every field's subscription instead.
	const { value, errors, constraints } = formFieldProxy(superform, field);

	/**
	 * `pattern` is stripped before the constraints reach the element.
	 *
	 * Zod's `z.email()` default regex arrives here as superforms' `pattern`
	 * constraint, and Chromium compiles pattern attributes with the `v` flag —
	 * under which that regex is invalid ("invalid character in class"), so the
	 * browser logged an error and ignored the constraint on every login and
	 * signup page load. Nothing is lost by dropping it: `type="email"` does the
	 * native check and the server action re-validates with Zod, which is the
	 * authoritative gate anyway.
	 */
	const attributes = $derived.by(() => {
		const { pattern: _pattern, ...rest } = $constraints ?? {};
		return rest;
	});

	/**
	 * The field is rendered FROM `$value` and writes back to it on input.
	 *
	 * Without this the input had no `value` at all: fine for login and signup,
	 * whose fields start empty and are read from the posted FormData, but every
	 * prefilled form (editing a partner, confirming an invite) rendered blank
	 * and then posted those blanks back. It also means `$form` now tracks what
	 * the user typed, which is what superforms' client-side validation and
	 * `tainted` tracking need.
	 *
	 * `bind:value` is deliberately not used: <wa-input> is a custom element, so
	 * Svelte cannot know it has a value property until the CDN bundle upgrades
	 * it, and the binding silently does nothing until then.
	 */
	type WaInput = HTMLElement & { value?: unknown; input?: HTMLInputElement | null };

	/**
	 * Follows what is typed with listeners of its own, on the element and on
	 * the native control inside it, rather than an `oninput=` attribute.
	 *
	 * The attribute is delegated by Svelte to one listener at the root, which
	 * does not reliably see an input event from inside `<wa-input>`'s shadow
	 * root (AGENTS.md). For a long while that went unnoticed here, because the
	 * element is form-associated and the posted FormData had the value either
	 * way; what went wrong was everything reading `$form` — a model picker's
	 * details went on describing the model the field held before it was
	 * edited. The value is read from the native control, which is
	 * authoritative, falling back to the element's own before it upgrades.
	 */
	const follow: Attachment<HTMLElement> = (element) => {
		const host = element as WaInput;
		const controller = new AbortController();
		const { signal } = controller;
		const sync = () => {
			// A field no longer in the document has nothing to sync.
			if (!host.isConnected) {
				return;
			}
			const typed = host.input?.value ?? host.value ?? '';
			// `as` because the proxy is typed to the field's own type; every input
			// this component renders is a string field.
			$value = String(typed) as typeof $value;
		};
		/**
		 * A `change` can arrive while Svelte is tearing this field down.
		 * Chromium fires `change` on a focused input whose value changed as
		 * its removal from the DOM takes focus from it — a form submitted
		 * with Enter keeps the field focused, where a click blurs it first —
		 * and Web Awesome relays that from the host while the element is
		 * still connected, so connectivity cannot tell that artifact from a
		 * real change. Writing to the form store there and then is
		 * `state_unsafe_mutation`, an uncaught error that kills the
		 * teardown. So a `change`'s write is deferred by a microtask, past
		 * the synchronous removal, and skipped by `sync` for a field that is
		 * gone by then; a real change lands a microtask later, which nothing
		 * can observe — blur and click are separate tasks, so any submit
		 * that follows still sees the value. `PasswordField.svelte` defers
		 * the same way.
		 */
		const syncChange = () => {
			queueMicrotask(sync);
		};
		host.addEventListener('input', sync, { signal });
		host.addEventListener('change', syncChange, { signal });
		customElements
			.whenDefined('wa-input')
			.then(async () => {
				await (host as unknown as { updateComplete?: Promise<unknown> }).updateComplete;
				if (!signal.aborted) {
					host.input?.addEventListener('input', sync, { signal });
					host.input?.addEventListener('change', syncChange, { signal });
				}
			})
			.catch(() => undefined);
		return () => controller.abort();
	};

	// null is a legitimate stored value (an omitted relationship label), but it
	// would render as the literal string "null".
	const displayValue = $derived(String($value ?? ''));
</script>

<div class="field">
	{#if type === 'password'}
		<wa-input
			label={title || field}
			name={field}
			{type}
			value={displayValue}
			{@attach follow}
			password-toggle
			aria-invalid={$errors ? 'true' : undefined}
			{...attributes}
			{...otherProps}
		>
			{#if startText}<span slot="start" class="start-text">{startText}</span>{/if}
		</wa-input>
	{:else if type === 'email' || type === 'text'}
		<wa-input
			label={title || field}
			name={field}
			{type}
			value={displayValue}
			{@attach follow}
			aria-invalid={$errors ? 'true' : undefined}
			{...attributes}
			{...otherProps}
		>
			{#if startText}<span slot="start" class="start-text">{startText}</span>{/if}
		</wa-input>
	{:else}
		{`Unsupported type: ${type}`}
	{/if}
	{#if $errors}<span class="invalid">{$errors}</span>{/if}
</div>

<style>
	.field {
		.start-text {
			color: var(--wa-color-text-quiet);
			white-space: nowrap;
			margin-inline-end: 0.35rem;
		}

		.invalid {
			color: var(--wa-color-text-danger);
		}
	}
</style>
