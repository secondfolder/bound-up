<script lang="ts">
	import RadioButton from '$lib/components/segmented/RadioButton.svelte';
	import RadioButtonGroup from '$lib/components/segmented/RadioButtonGroup.svelte';
	import type { PassageField } from '$lib/dream/fields';

	/**
	 * One field of a block (docs/dreams.md, "Fields"): a real control, named
	 * from the field's own words, whose value goes with the user's next turn.
	 * Once the turn has gone it shows what was entered and takes no input.
	 *
	 * Initial, sign and say are toggles, and a tap-count a button that counts:
	 * native buttons, because `wa-button` forwards no `aria-pressed`.
	 */
	let {
		field,
		value,
		live,
		onchange
	}: {
		field: PassageField;
		value: string;
		live: boolean;
		onchange: (value: string) => void;
	} = $props();

	const TOGGLES: Record<string, { on: string; verb: string; done: string }> = {
		initial: { on: 'initialled', verb: 'Initial', done: 'Initialled' },
		sign: { on: 'signed', verb: 'Sign', done: 'Signed' },
		say: { on: 'said', verb: 'Say it', done: 'Said' },
		check: { on: 'checked', verb: 'Tick', done: 'Ticked' }
	};
	const toggle = $derived(TOGGLES[field.type]);
	const count = $derived(Number.parseInt(value, 10) || 0);

	/** A Web Awesome text field, listened to directly: delegated events stop at its shadow root. */
	function listen(element: HTMLElement) {
		const read = () => onchange((element as HTMLInputElement).value ?? '');
		element.addEventListener('input', read);
		return () => element.removeEventListener('input', read);
	}
</script>

<span class="field" data-type={field.type}>
	{#if toggle}
		<span class="words">{field.label}</span>
		<button
			type="button"
			class="toggle"
			aria-pressed={value === toggle.on}
			disabled={!live}
			onclick={() => onchange(value === toggle.on ? '' : toggle.on)}
		>
			{#if value === toggle.on}
				<wa-icon name="check" aria-hidden="true"></wa-icon>
			{/if}
			<span class="visually-hidden">{toggle.verb}: {field.label}</span>
			<span aria-hidden="true">{value === toggle.on ? toggle.done : toggle.verb}</span>
		</button>
	{:else if field.type === 'tap-count'}
		<span class="words">{field.label}</span>
		<button
			type="button"
			class="toggle"
			disabled={!live || count >= field.target}
			onclick={() => onchange(String(Math.min(field.target, count + 1)))}
		>
			<span class="visually-hidden">Once more: {field.label},</span>
			{count} of {field.target}
		</button>
		<span class="visually-hidden" aria-live="polite">{count} of {field.target}</span>
	{:else if field.type === 'choice' && field.options.length > 0}
		{#if live}
			<RadioButtonGroup label={field.label} value={value || undefined} onchange={(chosen) => onchange(String(chosen))}>
				{#each field.options as option (option)}
					<RadioButton value={option}>{option}</RadioButton>
				{/each}
			</RadioButtonGroup>
		{:else}
			<span class="words">{field.label}: <strong>{value || 'skipped'}</strong></span>
		{/if}
	{:else if live}
		<wa-input label={field.label} {value} maxlength="1000" {@attach listen}></wa-input>
	{:else}
		<span class="words">{field.label}: <strong>{value || 'skipped'}</strong></span>
	{/if}
</span>

<style>
	.field {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-xs);
		margin-block: var(--wa-space-2xs);
		white-space: normal;

		wa-input {
			flex: 1 1 100%;
		}
	}

	.words {
		flex: 1 1 12rem;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--wa-space-2xs);
		min-height: 2.25rem;
		padding: 0 var(--wa-space-s);
		border: 1px dashed currentColor;
		border-radius: var(--wa-border-radius-s);
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;

		&[aria-pressed='true'] {
			border-style: solid;
			font-style: italic;
		}

		&:disabled {
			cursor: default;
			opacity: 0.8;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
