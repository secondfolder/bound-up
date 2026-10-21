<script lang="ts" generics="Kind extends FieldKind">
	import type { WaSelectEvent } from '@awesome.me/webawesome/dist/events/select.js';
	// biome-ignore lint/correctness/noUnusedImports: used by the script tag's `generics`, which Biome cannot see.
	import type { FieldKind } from '$lib/daydream';
	import {
		DAYDREAM_LIMITS,
		type DaydreamField,
		type DaydreamNarrator,
		fieldCap,
		knownField,
		MAX_FIELDS
	} from '$lib/daydream';
	import { fieldLabel } from '$lib/daydream/catalog';
	import type { SuggestFailure } from '$lib/daydream/suggest';
	import DaydreamChipField from './DaydreamChipField.svelte';

	/**
	 * A character's or an idea's fields (docs/daydreams.md, "Fields"): each
	 * a known kind, with its label, hint and chips, or one the user named;
	 * any can be removed, and any made a spoiler, kept out of sight until
	 * asked for. **Add a field** offers the known kinds not there yet, then
	 * one of the user's own.
	 *
	 * The list is the parent's (a superform field); every change hands back
	 * a new one.
	 */
	let {
		fields,
		of,
		kinds,
		labels,
		chips,
		narrator,
		onchange,
		onMoreIdeas,
		errors,
		debug = false
	}: {
		fields: readonly DaydreamField<Kind>[];
		of: 'character' | 'idea';
		/** The known kinds this record can have, in the order "Add a field" offers them. */
		kinds: readonly Kind[];
		/** Each known kind's label and hint. */
		labels: Readonly<Record<Kind, { label: string; hint: string }>>;
		chips: Readonly<Partial<Record<Kind, readonly string[]>>>;
		narrator?: DaydreamNarrator | undefined;
		onchange: (fields: DaydreamField<Kind>[]) => void;
		/** Asks for more chips for one field; absent when suggestions are off. */
		onMoreIdeas?:
			| ((
					field: DaydreamField<Kind>
			  ) => Promise<{ ok: true; value: string[] } | ({ ok: false } & SuggestFailure)>)
			| undefined;
		/** Each field's error, by its place in the list. */
		errors?: Record<number, { label?: string[]; value?: string[] }> | undefined;
		debug?: boolean;
	} = $props();

	/**
	 * The spoilers shown on this device for now. A spoiler is hidden even
	 * from the person editing it until they ask, so a ready-made or written
	 * twist is not read by accident; nothing about this is stored.
	 */
	let revealed: string[] = $state([]);

	const unused = $derived(kinds.filter((kind) => !fields.some((field) => field.kind === kind)));
	const full = $derived(fields.length >= MAX_FIELDS);

	const labelOf = (field: DaydreamField<Kind>) => fieldLabel(field, of, narrator);

	function update(index: number, patch: Partial<DaydreamField<Kind>>) {
		onchange(fields.map((field, at) => (at === index ? { ...field, ...patch } : field)));
	}

	function remove(index: number) {
		onchange(fields.filter((_, at) => at !== index));
	}

	function add(event: WaSelectEvent) {
		const { value } = event.detail.item as HTMLElement & { value?: string };
		if (full || value === undefined) {
			return;
		}
		const field: DaydreamField<Kind> =
			value === OWN
				? { id: crypto.randomUUID(), kind: null, label: '', value: '', spoiler: false }
				: knownField(value as Kind);
		onchange([...fields, field]);
	}

	const OWN = 'own';

	function setSpoiler(index: number, field: DaydreamField<Kind>) {
		update(index, { spoiler: !field.spoiler });
		// Made a spoiler by its writer, who has just read it: kept in view.
		revealed = field.spoiler ? revealed.filter((id) => id !== field.id) : [...revealed, field.id];
	}
</script>

<ul class="fields">
	{#each fields as field, index (field.id)}
		{const label = $derived(labelOf(field))}
		{const hidden = $derived(field.spoiler && !revealed.includes(field.id))}
		<li class="field">
			{#if field.kind === null}
				<label class="own-label">
					<span class="label">Name this field</span>
					<input
						type="text"
						maxlength={DAYDREAM_LIMITS.fieldLabel}
						placeholder="What scares them, a rule of the house…"
						value={field.label}
						oninput={(event) => update(index, { label: event.currentTarget.value })}
					/>
				</label>
				{#if errors?.[index]?.label}<span class="invalid">{errors[index].label}</span>{/if}
			{/if}
			{#if hidden}
				<div class="spoiler">
					<span class="label">{label || 'Your own field'}</span>
					<span class="hint">A spoiler, kept from you until the story reveals it.</span>
					<wa-button
						size="s"
						appearance="outlined"
						onclick={() => {
							revealed = [...revealed, field.id];
						}}
					>
						Show {label || 'the spoiler'}
					</wa-button>
				</div>
			{:else}
				<DaydreamChipField
					{debug}
					label={label || 'Your own field'}
					hint={field.kind === null ? 'Whatever this field says about them' : labels[field.kind].hint}
					value={field.value}
					limit={fieldCap(field.kind, of)}
					chips={field.kind === null ? [] : (chips[field.kind] ?? [])}
					rows={field.kind === 'personality' || field.kind === 'notes' ? 3 : 2}
					onchange={(text) => update(index, { value: text })}
					onMoreIdeas={onMoreIdeas && (field.kind !== null || field.label.trim())
						? () => onMoreIdeas(field)
						: undefined}
				/>
			{/if}
			{#if errors?.[index]?.value}<span class="invalid">{errors[index].value}</span>{/if}
			<div class="field-actions">
				<!-- A toggle: a native button, because wa-button forwards no aria-pressed (AGENTS.md). -->
				<button
					type="button"
					class="spoiler-toggle"
					aria-pressed={field.spoiler}
					onclick={() => setSpoiler(index, field)}
				>
					<wa-icon name={field.spoiler ? 'eye-slash' : 'eye'} variant="solid"></wa-icon>
					Spoiler
				</button>
				<wa-button size="s" appearance="plain" onclick={() => remove(index)}>
					<wa-icon name="xmark" variant="solid" label={`Remove ${label || 'this field'}`}></wa-icon>
				</wa-button>
			</div>
		</li>
	{/each}
</ul>

{#if !full}
	<wa-dropdown onwa-select={add}>
		<wa-button slot="trigger" size="s" appearance="outlined" with-caret class="add">
			<wa-icon slot="start" name="plus" variant="solid"></wa-icon>
			Add a field
		</wa-button>
		{#each unused as kind (kind)}
			<wa-dropdown-item value={kind}>{labelOf(knownField(kind))}</wa-dropdown-item>
		{/each}
		<wa-dropdown-item value={OWN}>Your own…</wa-dropdown-item>
	</wa-dropdown>
{/if}

<style>
	.fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.own-label,
	.spoiler {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.own-label input {
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 0.4rem;
		background: transparent;
		color: inherit;
		font: inherit;
	}

	.label {
		font-weight: 600;
	}

	.hint {
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}

	.spoiler wa-button {
		align-self: flex-start;
	}

	.field-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.25rem;
	}

	.spoiler-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0.65rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 999px;
		background: transparent;
		color: var(--wa-color-text-quiet);
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;

		&[aria-pressed='true'] {
			background: var(--wa-color-brand-fill-quiet);
			color: inherit;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.add {
		align-self: flex-start;
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
