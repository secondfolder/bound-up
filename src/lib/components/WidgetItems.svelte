<script lang="ts">
	import { partnerName } from '$lib/partner-names.svelte';
	import { openedWidgetTitle, shownText } from '$lib/sealed-views.svelte';
	import type { WidgetItemView } from '$lib/types';

	/**
	 * The preview list a section widget's body is usually made of.
	 *
	 * Rows are deliberately not links. The card header already links to the page
	 * that can act on them, and a row link would either duplicate that
	 * destination or give two links the same accessible name — both of which
	 * this codebase treats as bugs.
	 */
	let {
		items,
		/** Shown under the list when there are more items than rows shown. */
		more = null
	}: { items: WidgetItemView[]; more?: string | null } = $props();
</script>

<!--
	No empty state. A section with nothing to preview renders no body at all —
	see `SectionWidget` — because "Nothing to do right now." is a line that costs
	a reader a glance and tells them what the absence of a list already did.
-->
{#if items.length > 0}
	<ul>
		{#each items as item (item.id)}
			<li>
				<!-- Opened here, in the browser: the server never had the title. -->
				<span class="title">{shownText(openedWidgetTitle(item))}</span>
				{#if item.context}
					<!-- Which section this row came from on the page the header links
					     to. /home merges your things with every partner's, and two
					     partners can name a task the same thing.

					     A sibling of the title rather than inside it, so a long title
					     ellipsises before it and this stays: inside, the ellipsis cut
					     it off entirely and the row no longer said whose it was. -->
					<span class="context">{partnerName(item.context)}</span>
				{/if}
				{#if item.note}
					<span class="note">
						{item.note}
						{#if item.kind === 'task' || item.kind === 'reward'}
							<!-- A task's note is what it awards and a reward's what it
							     costs: both credits, which a bare "2" next to a balance did
							     not say. -->
							<wa-icon name="coins" variant="solid" label="credits"></wa-icon>
						{/if}
					</span>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
{#if more}
	<p class="more">{more}</p>
{/if}

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;

		li {
			display: flex;
			align-items: baseline;
			gap: 0.375rem;

			.title {
				flex: 0 1 auto;
				min-inline-size: 0;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.context {
				flex: 0 1 auto;
				/* Never more than a third of the row, so a long name cannot push
				   the title out instead. */
				max-inline-size: 33%;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				color: var(--wa-color-text-quiet);
				font-size: 0.8125rem;

				&::before {
					content: '· ';
				}
			}

			.note {
				flex: none;
				margin-inline-start: auto;
				display: inline-flex;
				align-items: center;
				gap: 0.25rem;
				font-size: 0.8125rem;
				padding: 0.0625rem 0.4375rem;
				border-radius: 999px;
				color: var(--wa-color-text-quiet);
				background-color: var(--wa-color-neutral-fill-quiet, transparent);
			}
		}
	}

	.more {
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-size: 0.875rem;

		/* Only spaced off a list that is actually above it. On its own — "2
		   waiting on a schedule" with nothing ready — it is the whole body. */
		&:not(:first-child) {
			margin-block-start: 0.5rem;
		}
	}
</style>
