<script lang="ts">
	import type { DaydreamNarrator, DaydreamSetup } from '$lib/daydream';
	import { ideaFieldLabels } from '$lib/daydream/catalog';
	import {
		CATCH_UP_CHARACTER_FIELDS,
		type CatchUp,
		type CatchUpCharacterField,
		type CatchUpIdeaField
	} from '$lib/daydream/suggestions';
	import { addedRuns } from '$lib/word-diff';

	/**
	 * "Update the idea": what the story has settled, proposed as changes to
	 * this daydream's idea and characters (docs/daydreams.md, "When the story
	 * moves on"). Each change is shown as it would read, the words it adds
	 * marked, with what it replaces under it; each can be left out or edited
	 * before saving. Only this daydream's copy changes, never the library's.
	 */
	let {
		setup,
		proposed,
		onsave,
		onclose
	}: {
		setup: DaydreamSetup;
		proposed: CatchUp;
		/** Answers why it could not be saved, or null. */
		onsave: (accepted: CatchUp) => Promise<string | null>;
		onclose: () => void;
	} = $props();

	type Row = {
		key: string;
		/** Whose field: the idea, or a character by name. */
		owner:
			| { kind: 'idea'; field: CatchUpIdeaField }
			| {
					kind: 'character';
					name: string;
					field: CatchUpCharacterField;
			  };
		label: string;
		was: string;
		text: string;
		use: boolean;
	};

	const CHARACTER_LABELS: Readonly<Record<CatchUpCharacterField, string>> = {
		personality: 'Personality',
		relationship: 'Who they are to you',
		doing: 'What they’re doing'
	};

	function rowsFor(narrator: DaydreamNarrator): Row[] {
		const labels = ideaFieldLabels(narrator);
		const idea = Object.entries(proposed.idea).map(([field, text]) => {
			const key = field as CatchUpIdeaField;
			return {
				key: `idea.${key}`,
				owner: { kind: 'idea' as const, field: key },
				label: labels[key].label,
				was: setup.idea[key],
				text: text ?? '',
				use: true
			};
		});
		const cast = proposed.characters.flatMap(({ name, fields }) => {
			const character = setup.characters.find(
				(each) => each.name.toLowerCase() === name.toLowerCase()
			);
			const was: Record<CatchUpCharacterField, string> = {
				personality: character?.personality ?? '',
				relationship: character?.casting.relationship ?? '',
				doing: character?.casting.part ?? ''
			};
			return CATCH_UP_CHARACTER_FIELDS.flatMap((field) =>
				fields[field] === undefined
					? []
					: [
							{
								key: `${name}.${field}`,
								owner: { kind: 'character' as const, name, field },
								label: `${name}: ${CHARACTER_LABELS[field]}`,
								was: was[field],
								text: fields[field] ?? '',
								use: true
							}
						]
			);
		});
		return [...idea, ...cast];
	}

	// svelte-ignore state_referenced_locally
	// Built once from what was proposed; from then on it is the user's.
	let rows: Row[] = $state(rowsFor(setup.voice.narrator));
	let problem: string | null = $state(null);
	let saving = $state(false);
	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();

	/**
	 * A `wa-checkbox`'s and a `wa-textarea`'s value, read from the element on
	 * its own events: Svelte's delegated handlers do not reliably cross a
	 * custom element's shadow boundary (AGENTS.md).
	 */
	function listen(node: HTMLElement, type: string, update: () => void) {
		node.addEventListener(type, update);
		return () => node.removeEventListener(type, update);
	}

	function onChecked(row: Row) {
		return (node: HTMLElement) =>
			listen(node, 'change', () => {
				row.use = Boolean((node as HTMLElement & { checked: boolean }).checked);
			});
	}

	function onEdited(row: Row) {
		return (node: HTMLElement) =>
			listen(node, 'input', () => {
				row.text = String((node as HTMLElement & { value: unknown }).value ?? '');
			});
	}

	const chosen = $derived(rows.filter((row) => row.use && row.text.trim() !== ''));

	async function save() {
		const accepted: CatchUp = { idea: {}, characters: [] };
		for (const row of chosen) {
			const text = row.text.trim();
			if (row.owner.kind === 'idea') {
				accepted.idea[row.owner.field] = text;
				continue;
			}
			const { name, field } = row.owner;
			let entry = accepted.characters.find((each) => each.name === name);
			if (!entry) {
				entry = { name, fields: {} };
				accepted.characters.push(entry);
			}
			entry.fields[field] = text;
		}
		saving = true;
		problem = await onsave(accepted);
		saving = false;
		if (!problem && dialog) {
			dialog.open = false;
		}
	}
</script>

<wa-dialog bind:this={dialog} label="Update the idea" open onwa-after-hide={(event: Event) => event.target === dialog && onclose()}>
	<p class="hint">
		The story has moved on from how it was set up. These changes bring this daydream's idea up to
		date; your library stays as it is.
	</p>
	<ul class="changes">
		{#each rows as row (row.key)}
			<li>
				<wa-checkbox {@attach onChecked(row)} checked={row.use}>
					{row.label}
				</wa-checkbox>
				<p class="proposed">
					{#each addedRuns(row.was, row.text) as run, index (index)}
						{#if run.added}<mark>{run.text}</mark>{:else}{run.text}{/if}
					{/each}
				</p>
				{#if row.was}<p class="was">Was: {row.was}</p>{/if}
				{#if row.use}
					<wa-textarea {@attach onEdited(row)} label="Edit it" value={row.text} rows={2} resize="auto"></wa-textarea>
				{/if}
			</li>
		{/each}
	</ul>
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
	<wa-button
		slot="footer"
		appearance={chosen.length > 0 ? 'filled' : 'outlined'}
		variant={chosen.length > 0 ? 'brand' : 'neutral'}
		disabled={chosen.length === 0 || saving}
		onclick={save}
	>
		Update the idea
	</wa-button>
</wa-dialog>

<style>
	.hint {
		margin: 0 0 0.75rem;
		color: var(--wa-color-text-quiet);
	}

	.changes {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			flex-direction: column;
			gap: 0.375rem;
		}

		p {
			margin: 0;
		}

		mark {
			background: var(--wa-color-brand-fill-quiet);
			color: inherit;
		}

		.was {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
