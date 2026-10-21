<script lang="ts" module>
	type T = Record<string, unknown>;
</script>

<script lang="ts" generics="T extends Record<string, unknown>">
	import type { Attachment } from 'svelte/attachments';
	import { type FormPathLeaves, formFieldProxy, type SuperForm } from 'sveltekit-superforms';

	/**
	 * A superforms field as a `wa-select`: InputField's counterpart for a
	 * choice from a list. The options are values the field's schema accepts;
	 * the schema, not this, is what refuses anything else.
	 */
	let {
		superform,
		field,
		title,
		options,
		...otherProps
	}: {
		superform: SuperForm<T>;
		field: FormPathLeaves<T>;
		title: string;
		options: readonly { value: string; label: string }[];
		// Spread onto the <wa-select>, as InputField does onto its <wa-input>.
		[attribute: string]: unknown;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captured once on purpose, as in InputField: the proxies are the live stores.
	const { value, errors } = formFieldProxy(superform, field);

	/**
	 * Follows the choice with a listener on the element itself. `wa-select`
	 * reports it with a `change` on the host, and an `onchange=` attribute
	 * would be delegated by Svelte to the root, which does not reliably hear
	 * events from a custom element (AGENTS.md).
	 */
	const follow: Attachment<HTMLElement> = (element) => {
		const host = element as HTMLElement & { value?: unknown };
		const sync = () => {
			if (host.isConnected) {
				// `as` because the proxy is typed to the field's own union.
				$value = String(host.value ?? '') as typeof $value;
			}
		};
		host.addEventListener('change', sync);
		host.addEventListener('input', sync);
		return () => {
			host.removeEventListener('change', sync);
			host.removeEventListener('input', sync);
		};
	};
</script>

<div class="field">
	<wa-select
		label={title}
		name={field}
		value={String($value ?? '')}
		{@attach follow}
		aria-invalid={$errors ? 'true' : undefined}
		{...otherProps}
	>
		{#each options as option (option.value)}
			<wa-option value={option.value}>{option.label}</wa-option>
		{/each}
	</wa-select>
	{#if $errors}<span class="invalid">{$errors}</span>{/if}
</div>

<style>
	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
