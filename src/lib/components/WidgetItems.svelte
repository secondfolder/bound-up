<script lang="ts">
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
				<span class="title">
					{item.title}
					{#if item.context}
						<!-- Which section this row came from on the page the header links
						     to. /home merges your things with every partner's, and two
						     partners can name a task the same thing. -->
						<span class="context">{item.context}</span>
					{/if}
				</span>
				{#if item.note}
					<span class="note">{item.note}</span>
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
			gap: 0.5rem;

			.title {
				flex: 1 1 auto;
				min-inline-size: 0;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;

				.context {
					color: var(--wa-color-text-quiet);
					font-size: 0.8125rem;

					&::before {
						content: '· ';
					}
				}
			}

			.note {
				flex: none;
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
