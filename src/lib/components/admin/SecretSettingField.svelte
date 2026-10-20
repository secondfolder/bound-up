<script lang="ts" module>
	type T = Record<string, unknown>;
</script>

<script lang="ts" generics="T extends Record<string, unknown>">
	import { type FormPathLeaves, formFieldProxy, type SuperForm } from 'sveltekit-superforms';
	import InputField from '$lib/components/InputField.svelte';

	/**
	 * A credential on Admin → Server settings: an API key, or an SMTP URL with
	 * a password in it.
	 *
	 * The stored value never reaches the browser, so a set one shows only its
	 * last few characters, with Replace and Remove. Replace reveals an empty
	 * field: typing in it replaces the stored value when the form is saved,
	 * and leaving it empty keeps it. Remove is said in `changeField`, because
	 * an empty field already means "keep". See `secretAfter` in the page's
	 * server file.
	 */
	let {
		superform,
		field,
		changeField,
		label,
		stored,
		hint = null,
		placeholder = null
	}: {
		superform: SuperForm<T>;
		field: FormPathLeaves<T>;
		changeField: FormPathLeaves<T>;
		label: string;
		stored: { set: boolean; tail: string };
		hint?: string | null;
		placeholder?: string | null;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captures the initial `superform`/fields on purpose, as `InputField` does:
	// the proxies are the live stores.
	const { value } = formFieldProxy(superform, field);
	// svelte-ignore state_referenced_locally
	const { value: change } = formFieldProxy(superform, changeField);

	let replacing = $state(false);
	const editing = $derived(!stored.set || replacing);

	function replace() {
		replacing = true;
	}

	function remove() {
		$change = 'remove' as typeof $change;
	}

	function keep() {
		$change = 'keep' as typeof $change;
	}

	function cancel() {
		replacing = false;
		$value = '' as typeof $value;
	}
</script>

<div class="secret">
	<input type="hidden" name={changeField} value={String($change ?? 'keep')} />
	{#if editing && $change !== 'remove'}
		<InputField
			{superform}
			{field}
			title={label}
			type="password"
			autocomplete="off"
			hint={stored.set ? 'Leave it empty to keep the one saved.' : hint}
			placeholder={placeholder ?? undefined}
		/>
		{#if stored.set}
			<wa-button size="s" appearance="plain" onclick={cancel}>Keep the saved one</wa-button>
		{/if}
	{:else}
		<span class="label">{label}</span>
		<div class="row">
			{#if $change === 'remove'}
				<span class="state removing">Removed when you save</span>
				<wa-button
					size="s"
					appearance="outlined"
					onclick={keep}>Undo</wa-button
				>
			{:else}
				<span class="state">
					<wa-icon name="key" variant="solid"></wa-icon>
					Saved{#if stored.tail}, ending <code>…{stored.tail}</code>{/if}
				</span>
				<wa-button size="s" appearance="outlined" onclick={replace}>Replace</wa-button>
				<wa-button
					size="s"
					appearance="outlined"
					variant="danger"
					onclick={remove}>Remove</wa-button
				>
			{/if}
		</div>
		{#if hint && $change !== 'remove'}<small class="hint">{hint}</small>{/if}
	{/if}
</div>

<style>
	.secret {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;

		> :global(.field) {
			align-self: stretch;
		}

		.label {
			font-size: var(--wa-form-control-label-font-size);
			font-weight: var(--wa-form-control-label-font-weight);
		}

		.row {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.5rem;
		}

		.state {
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			margin-inline-end: auto;
			color: var(--wa-color-text-quiet);
		}

		.removing {
			color: var(--wa-color-text-danger);
		}

		.hint {
			color: var(--wa-color-text-quiet);
		}
	}
</style>
