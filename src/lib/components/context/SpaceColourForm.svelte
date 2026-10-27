<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SelectField from '$lib/components/SelectField.svelte';
	import { initialsFor } from '$lib/initials';
	import type { SpaceColourForm } from '$lib/schemas/spaceColourForm';
	import { spaceColourFormSchema } from '$lib/schemas/spaceColourForm';
	import { SPACE_COLOUR_LABELS, SPACE_COLOURS, spaceColourValue } from '$lib/space-colours';
	import { superForm } from '$lib/superform';
	import ContextAvatar from './ContextAvatar.svelte';

	/**
	 * The colour a partnership shows in, to you: in the context switcher, and
	 * on every row of an Everyone list. Yours alone; your partner chooses their
	 * own for you. See docs/contexts.md.
	 */
	let {
		form,
		partnerName
	}: {
		form: SuperValidated<SpaceColourForm>;
		/** What you call them, for the preview's initials. */
		partnerName: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captured once, as every superform is: the stores are the live connection.
	const superform = superForm(form, {
		resetForm: false,
		validators: zod4Client(spaceColourFormSchema)
	});
	const { enhance, form: values, tainted, allErrors, submitting } = superform;

	const options = SPACE_COLOURS.map((colour) => ({
		value: colour,
		label: SPACE_COLOUR_LABELS[colour]
	}));

	// Outlined until there is a valid change to save, as every save button is.
	const ready = $derived(Boolean($tainted?.colour) && $allErrors.length === 0);
</script>

<form method="POST" action="?/colour" use:enhance class="colour">
	<div class="choice">
		<ContextAvatar
			kind="shared"
			size={40}
			people={[{ colour: spaceColourValue($values.colour), initials: initialsFor(partnerName) }]}
		/>
		<SelectField {superform} field="colour" title="Their colour, to you" {options} />
	</div>
	<p class="hint">
		How they show in the switcher and beside what's theirs. Only you see it.
	</p>
	<div>
		<wa-button
			type="submit"
			variant="brand"
			appearance={ready ? 'accent' : 'outlined'}
			disabled={$submitting}>Save colour</wa-button
		>
	</div>
</form>

<style>
	.colour {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	.choice {
		display: flex;
		align-items: end;
		gap: var(--wa-space-s);

		:global(.field) {
			flex: 1 1 auto;
		}
	}

	.hint {
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}
</style>
