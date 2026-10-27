<script lang="ts">
	import SpaceChip from '$lib/components/context/SpaceChip.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ItemGroup from '$lib/components/ItemGroup.svelte';
	import ItemRow from '$lib/components/ItemRow.svelte';
	import { groupByDay, timeOfDay } from '$lib/day-groups';
	import { openedCompletion, openedPart, shownText } from '$lib/sealed-views.svelte';
	import type { ContextSpaceView, TaskCompletionView } from '$lib/types';

	/**
	 * Task completions, a line each under the day they happened, as the
	 * checklist is. The completion message given each time is the one thing
	 * worth reading back, so it stays; the task's description, which every
	 * completion of it repeated, does not. Over several spaces (Everyone),
	 * each line says whose space with a chip.
	 */
	type Props = {
		completions: TaskCompletionView[];
		/** The spaces the history covers, as the switcher knows them. */
		spaces: readonly ContextSpaceView[];
		emptyMessage: string;
	};

	let { completions, spaces, emptyMessage }: Props = $props();

	const spaceById = $derived(new Map(spaces.map((space) => [space.id, space])));
	const several = $derived(spaces.length > 1);

	/** Each row with its content opened, or a placeholder while it opens (`sealed-views.svelte.ts`). */
	const days = $derived(
		groupByDay(
			completions.map((completion) => ({ completion, opened: openedCompletion(completion) })),
			(row) => row.completion.createdAt
		)
	);
</script>

{#if completions.length === 0}
	<EmptyState icon="clock-rotate-left" title={emptyMessage}>
		<p>Each task completed shows up here, with the credits it earned.</p>
	</EmptyState>
{:else}
	<div class="days">
		{#each days as day (day.key)}
			<ItemGroup title={day.label}>
				{#each day.items as { completion, opened } (completion.id)}
					<ItemRow title={shownText(openedPart(opened, (value) => value.taskTitle))}>
						{#snippet meta()}
							<span>{timeOfDay(completion.createdAt)}</span>
							{const space = $derived(spaceById.get(completion.spaceId))}
							{#if several && space}<SpaceChip {space} />{/if}
							{#if space?.kind === 'shared'}
								<span>{completion.mine ? 'Completed by you' : 'Completed by your partner'}</span>
								{#if completion.createdByMe}<span>Created by you</span>{/if}
							{/if}
						{/snippet}
						{#snippet trailing()}
							<span class="award">
								+{completion.creditsAwarded}<span class="wa-visually-hidden"
									>{' '}credit{completion.creditsAwarded === 1 ? '' : 's'}</span
								>
							</span>
						{/snippet}
						{#snippet below()}
							{#if opened?.completionMessage}
								<p class="message">{opened.completionMessage}</p>
							{/if}
						{/snippet}
					</ItemRow>
				{/each}
			</ItemGroup>
		{/each}
	</div>
{/if}

<style>
	.days {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-l);
	}

	.award {
		color: var(--wa-color-brand-on-normal);
	}

	.message {
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-style: italic;
	}
</style>
