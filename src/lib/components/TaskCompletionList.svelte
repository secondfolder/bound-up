<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ItemCard from '$lib/components/ItemCard.svelte';
	import RichText from '$lib/components/RichText.svelte';
	import { creditAwardLabel } from '$lib/credits';
	import { openedCompletion, openedPart, shownText } from '$lib/sealed-views.svelte';
	import type { PartnershipTaskCompletionView, TaskCompletionView } from '$lib/types';

	type CompletionView = TaskCompletionView | PartnershipTaskCompletionView;

	type Props = {
		completions: CompletionView[];
		emptyMessage: string;
	};

	let { completions, emptyMessage }: Props = $props();

	function formatDateTime(date: Date): string {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(date);
	}

	function isPartnershipCompletion(
		completion: CompletionView
	): completion is PartnershipTaskCompletionView {
		return 'mine' in completion;
	}

	/** Each row with its content opened, or a placeholder while it opens (`sealed-views.svelte.ts`). */
	const rows = $derived(
		completions.map((completion) => ({ completion, opened: openedCompletion(completion) }))
	);
</script>

{#if completions.length === 0}
	<EmptyState icon="clock-rotate-left" title={emptyMessage}>
		<p>Each task completed shows up here, with the credits it earned.</p>
	</EmptyState>
{:else}
	<div class="list">
		{#each rows as { completion, opened } (completion.id)}
			<ItemCard title={shownText(openedPart(opened, (value) => value.taskTitle))}>
				{#snippet meta()}
					<p>
						{formatDateTime(completion.createdAt)}
						{#if isPartnershipCompletion(completion)}
							· {completion.mine ? 'Completed by you' : 'Completed by your partner'}
							{#if completion.createdByMe}
								· Created by you{/if}
						{/if}
					</p>
				{/snippet}
				{#snippet value()}{creditAwardLabel(completion.creditsAwarded)}{/snippet}

				{#if opened?.taskDescription}<RichText text={opened.taskDescription} />{/if}
				{#if opened?.completionMessage}
					<p class="message">{opened.completionMessage}</p>
				{/if}
			</ItemCard>
		{/each}
	</div>
{/if}

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	p {
		margin: 0;
	}

	.message {
		color: var(--wa-color-text-quiet);
		font-style: italic;
	}

	.message:not(:first-child) {
		margin-block-start: 0.5rem;
	}
</style>
