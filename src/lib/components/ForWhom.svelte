<script lang="ts">
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import SelectField from '$lib/components/SelectField.svelte';
	import { SOLO_NAME, shownSpace } from '$lib/context-client.svelte';
	import type { ItemTarget } from '$lib/item-target';
	import { superForm } from '$lib/superform';
	import type { ContextSpaceView } from '$lib/types';

	/**
	 * "For whom?": which space a new task or reward goes to, asked when the
	 * page shows more than one it could go to (Everyone). Me, then each
	 * partner. The last one chosen is remembered on this device, as the
	 * default next time, as the notebook's is.
	 *
	 * Never posted itself: the form it sits over posts the chosen space as
	 * `spaceId`, which the server checks. The context is never read for it
	 * (docs/contexts.md, "Writes name their space").
	 */
	let {
		targets,
		spaces,
		storageKey,
		onchoose
	}: {
		targets: readonly ItemTarget[];
		/** The switcher's spaces, for each target's name. */
		spaces: readonly ContextSpaceView[];
		/** Where the last choice is remembered on this device. */
		storageKey: string;
		/** Called with the chosen target, or null while there is none. */
		onchoose: (target: ItemTarget | null) => void;
	} = $props();

	const schema = z.object({ spaceId: z.string().min(1, 'Choose who it’s for') });

	function remembered(): string {
		try {
			return globalThis.localStorage?.getItem(storageKey) ?? '';
		} catch {
			return '';
		}
	}

	// svelte-ignore state_referenced_locally
	// Captured once, as every superform is: the stores are the live connection.
	const superform = superForm(
		defaults({ spaceId: remembered() }, zod4Client(schema), { id: `${storageKey}-form` }),
		{ SPA: true, resetForm: false, validators: zod4Client(schema) }
	);
	const { form } = superform;

	const options = $derived(
		targets.map((target) => {
			const space = spaces.find((candidate) => candidate.id === target.spaceId);
			return {
				value: target.spaceId,
				label:
					target.kind === 'solo' || !space ? `${SOLO_NAME}, just for you` : shownSpace(space).name
			};
		})
	);

	const chosen = $derived(targets.find((target) => target.spaceId === $form.spaceId) ?? null);

	$effect(() => {
		onchoose(chosen);
		if (!chosen) {
			return;
		}
		try {
			globalThis.localStorage?.setItem(storageKey, chosen.spaceId);
		} catch {
			// Only a default for next time.
		}
	});
</script>

<div class="for-whom">
	<SelectField
		{superform}
		field="spaceId"
		title="For whom?"
		{options}
		placeholder="Choose who it’s for"
	/>
</div>

<style>
	.for-whom {
		margin-block-end: var(--wa-space-m);
	}
</style>
