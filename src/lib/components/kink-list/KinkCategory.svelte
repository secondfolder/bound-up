<script lang="ts">
	import {
		isAnswered,
		isShown,
		MAX_CUSTOM_DESCRIPTION_LENGTH,
		MAX_CUSTOM_NAME_LENGTH
	} from '$lib/kink-list/answers';
	import { childrenOf, type KinkItem, relatedKinks } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import KinkRow from './KinkRow.svelte';

	/**
	 * One category, as a section of the one-page list that starts open and
	 * folds away: its kinks, any the person added to it, and the kinks that
	 * live in another category but fit here too.
	 *
	 * Related kinks are behind a button rather than mixed in, so the category
	 * reads as the list it is. They answer exactly as in their own category:
	 * it is the same item, so the answer is the same answer.
	 */
	let { category }: { category: KinkItem } = $props();

	const { store } = kinkListContext();
	const id = $props.id();

	const kinks = $derived(childrenOf(category.id).filter((kink) => isShown(kink, store.filters)));
	const hidden = $derived(childrenOf(category.id).length - kinks.length);
	const related = $derived(relatedKinks(category.id).filter((kink) => isShown(kink, store.filters)));
	const custom = $derived(store.customKinks(category.id));
	/** "3 of 12": how much of what is shown here is answered. */
	const answered = $derived(
		kinks.filter((kink) => isAnswered(store.list.answers[kink.id])).length +
			custom.filter(([key]) => isAnswered(store.list.answers[key])).length
	);

	let showRelated = $state(false);
	let adding = $state(false);

	type WaInput = HTMLElement & { value: string | null };
	let nameField: WaInput | undefined = $state();
	let descriptionField: WaInput | undefined = $state();
	let addError = $state('');
	/** Followed as it is typed, so Add turns solid once there is a name to add. */
	let typedName = $state('');

	/** Wired by hand: a wa-input's input happens in its shadow root (AGENTS.md). */
	function followName(node: WaInput) {
		const onInput = () => {
			typedName = node.value?.trim() ?? '';
		};
		node.addEventListener('input', onInput);
		return () => node.removeEventListener('input', onInput);
	}

	function add(event: SubmitEvent) {
		event.preventDefault();
		const name = nameField?.value?.trim() ?? '';
		if (!name) {
			addError = 'Give it a name.';
			return;
		}
		const description = descriptionField?.value?.trim() ?? '';
		store.addCustom({
			name: name.slice(0, MAX_CUSTOM_NAME_LENGTH),
			categoryId: category.id,
			description: description ? description.slice(0, MAX_CUSTOM_DESCRIPTION_LENGTH) : undefined
		});
		addError = '';
		typedName = '';
		adding = false;
	}
</script>

<!-- Open from the start, in the server's HTML too: `open` is safe in markup
     because it is never false here (AGENTS.md, on boolean properties). -->
<wa-details class="category" id="category-{category.id}" open>
	<span slot="summary" class="summary">
		<h3 id="{id}-title">{category.name}</h3>
		<span class="count">{answered} of {kinks.length + custom.length}</span>
	</span>
	<p class="description">{category.description}</p>

	<div class="kinks">
		{#each kinks as kink (kink.id)}
			<KinkRow itemKey={kink.id} />
		{/each}
		{#each custom as [key] (key)}
			<div class="custom">
				<KinkRow itemKey={key} />
				<button type="button" class="link" onclick={() => store.removeCustom(key)}>
					Remove<span class="wa-visually-hidden">{store.list.custom[key]?.name}</span>
				</button>
			</div>
		{/each}
	</div>

	{#if hidden > 0}
		<p class="hidden-note">
			{hidden === 1 ? '1 more kink is' : `${hidden} more kinks are`} hidden by your filters.
		</p>
	{/if}

	<div class="actions">
		{#if related.length > 0}
			<!-- A disclosure: aria-expanded, which wa-button would not forward. -->
			<button
				type="button"
				class="link"
				aria-expanded={showRelated}
				aria-controls="{id}-related"
				onclick={() => {
					showRelated = !showRelated;
				}}
			>
				{showRelated ? 'Hide related kinks' : `${related.length} related kinks`}
			</button>
		{/if}
		{#if !adding}
			<button type="button" class="link" onclick={() => {
					adding = true;
				}}>Add your own</button>
		{/if}
	</div>

	{#if showRelated}
		<div class="related" id="{id}-related">
			<p class="description">These live in another category, and fit here too. Answering one here answers it there.</p>
			{#each related as kink (kink.id)}
				<KinkRow itemKey={kink.id} />
			{/each}
		</div>
	{/if}

	{#if adding}
		<form class="add" onsubmit={add}>
			<wa-input
				label="Your kink"
				maxlength={MAX_CUSTOM_NAME_LENGTH}
				bind:this={nameField}
				{@attach followName}
				hint={addError || undefined}
			></wa-input>
			<wa-input
				label="What it is (optional)"
				maxlength={MAX_CUSTOM_DESCRIPTION_LENGTH}
				bind:this={descriptionField}
			></wa-input>
			<div class="buttons">
				<wa-button type="submit" variant="brand" appearance={typedName ? 'accent' : 'outlined'}
					>Add</wa-button
				>
				<wa-button type="button" appearance="outlined" onclick={() => {
					adding = false;
				}}
					>Cancel</wa-button
				>
			</div>
		</form>
	{/if}
</wa-details>

<style>
	.category {
		&::part(header) {
			padding-block: 0.5rem;
		}

		&::part(content) {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			padding-block-start: 0;
		}
	}

	.summary {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		inline-size: 100%;

		h3 {
			margin: 0;
			font-size: 1.05rem;
		}
	}

	.count {
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);
		white-space: nowrap;
	}

	.description,
	.hidden-note {
		margin: 0;
		font-size: 0.9rem;
		color: var(--wa-color-text-quiet);
	}

	.kinks,
	.related {
		display: flex;
		flex-direction: column;
	}

	.custom {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;

		:global(.kink) {
			align-self: stretch;
		}
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--wa-color-brand-on-quiet);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.add {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;

		.buttons {
			display: flex;
			gap: 0.5rem;
		}
	}
</style>
