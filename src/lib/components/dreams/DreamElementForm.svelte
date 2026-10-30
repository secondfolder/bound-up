<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { defaults, type FormPathLeaves } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import InputField from '$lib/components/InputField.svelte';
	import { unlockedIdentity } from '$lib/crypto/session.svelte';
	import type { DreamElement } from '$lib/dream/elements';
	import { type DraftSession, openDraft } from '$lib/messaging/drafts';
	import { type DreamElementForm, dreamElementFormSchema } from '$lib/schemas/dreamElementForm';
	import { superForm } from '$lib/superform';

	/**
	 * Changing an element on the setup page (docs/dreams.md, "Changing what
	 * was made"): its name, its short name and every field, hidden ones too.
	 * What is typed is kept as an encrypted draft until it is saved (AGENTS.md,
	 * "Never lose something a user typed").
	 */
	let {
		element,
		dreamId,
		onsave,
		oncancel
	}: {
		element: DreamElement;
		dreamId: string;
		onsave: (changed: DreamElement) => Promise<boolean>;
		oncancel: () => void;
	} = $props();

	let draft: DraftSession | null = null;

	// svelte-ignore state_referenced_locally
	// The element as it was when the form opened: the form is the live copy.
	const start: DreamElementForm = {
		name: element.name,
		short: element.short ?? '',
		fields: element.fields.map(({ name, text, shown }) => ({ name, text, shown }))
	};
	// svelte-ignore state_referenced_locally
	const superform = superForm(
		defaults(start, zod4Client(dreamElementFormSchema), { id: `element-${element.id}` }),
		{
			SPA: true,
			applyAction: false,
			invalidateAll: false,
			resetForm: false,
			dataType: 'json',
			validators: zod4Client(dreamElementFormSchema),
			async onUpdate({ form: submitted }) {
				if (!submitted.valid) {
					return;
				}
				const { name, short, fields } = submitted.data;
				const { short: _was, ...rest } = element;
				const changed: DreamElement = {
					...rest,
					name,
					...(short && short !== name ? { short } : {}),
					fields: element.fields
						.map((field, index) => ({ ...field, text: fields[index]?.text ?? field.text }))
						.filter((field) => field.text.trim() !== '')
				};
				if (await onsave(changed)) {
					draft?.clear();
				}
			}
		}
	);
	const { form, enhance, submitting, tainted, allErrors } = superform;

	onMount(() => {
		void openDraft(
			untrack(() => ({ kind: 'dream-element' as const, dreamId, elementId: element.id })),
			unlockedIdentity()
		).then((session) => {
			draft = session;
			try {
				const saved = session.initial ? JSON.parse(session.initial.text) : null;
				const parsed = dreamElementFormSchema.safeParse(saved);
				if (parsed.success && parsed.data.fields.length === start.fields.length) {
					$form = parsed.data;
				}
			} catch {
				// A draft that will not read is no draft.
			}
		});
	});

	$effect(() => {
		const text = $tainted ? JSON.stringify($form) : '';
		draft?.save({ text, tagIds: [] });
	});

	/** A field's tag as a label: `relationship-with-you` reads "Relationship with you". */
	function heading(name: string): string {
		const words = name.replaceAll('-', ' ');
		return words.charAt(0).toUpperCase() + words.slice(1);
	}

	const fieldPath = (index: number) => `fields[${index}].text` as FormPathLeaves<DreamElementForm>;

	const ready = $derived(Boolean($tainted) && $allErrors.length === 0);
</script>

<form method="POST" use:enhance class="element-form">
	<InputField {superform} field="name" type="text" title="Name" autocomplete="off" />
	<InputField
		{superform}
		field="short"
		type="text"
		title="Short name"
		hint="What to call it on screen, when the name is long."
		autocomplete="off"
	/>
	{#each start.fields as field, index (index)}
		<InputField
			{superform}
			field={fieldPath(index)}
			type="textarea"
			rows={2}
			title={field.shown ? heading(field.name) : `${heading(field.name)} (behind the scenes)`}
		/>
	{/each}
	<div class="actions">
		<wa-button appearance="plain" onclick={oncancel}>Cancel</wa-button>
		<wa-button
			type="submit"
			appearance={ready ? 'accent' : 'outlined'}
			variant={ready ? 'brand' : 'neutral'}
			disabled={$submitting}
		>
			Save
		</wa-button>
	</div>
</form>

<style>
	.element-form {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--wa-space-xs);
	}
</style>
