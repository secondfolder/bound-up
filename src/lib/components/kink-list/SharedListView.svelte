<script lang="ts">
	import {
		type Answer,
		DETAIL_KEYS,
		DETAIL_LABELS,
		DETAIL_STEPS,
		type Detail,
		isAnswered,
		LEVEL_LABELS,
		type ListPayload
	} from '$lib/kink-list/answers';
	import { catalog, categories, childrenOf, sidesOf } from '$lib/kink-list/catalog';

	/**
	 * Someone's kink list, to read: every kink they answered, by category, with
	 * the detail they gave. Only answers of their own are listed — a kink that
	 * only inherits one would repeat its kink's line — plus any category they
	 * ruled out wholesale.
	 */
	let { list }: { list: ListPayload } = $props();

	type Row = { key: string; name: string; answer: Answer; sides: readonly [string, string] | null };

	function rowsFor(categoryId: string): Row[] {
		const rows: Row[] = [];
		const add = (key: string, name: string, sides: Row['sides']) => {
			const answer = list.answers[key];
			if (answer && (isAnswered(answer) || answer.note)) {
				rows.push({ key, name, answer, sides });
			}
		};
		for (const kink of childrenOf(categoryId)) {
			add(kink.id, kink.name, sidesOf(kink));
			for (const specific of childrenOf(kink.id)) {
				add(specific.id, `${kink.name}: ${specific.name}`, sidesOf(specific));
			}
		}
		for (const [key, kink] of Object.entries(list.custom)) {
			if (!kink.removed && kink.categoryId === categoryId) {
				add(key, kink.name, null);
			}
		}
		return rows;
	}

	function detailText(detail: Detail | undefined): string {
		return DETAIL_KEYS.filter((key) => detail?.[key] !== undefined)
			.map((key) => `${DETAIL_LABELS[key]}: ${DETAIL_STEPS[key][detail?.[key] ?? 0]}`)
			.join(' · ');
	}

	function answerText(row: Row): string {
		const { answer, sides } = row;
		if (sides && answer.sides) {
			return (['a', 'b'] as const)
				.map((side, index) => {
					const level = answer.sides?.[side]?.level ?? answer.level;
					return level ? `${sides[index]}: ${LEVEL_LABELS[level]}` : '';
				})
				.filter(Boolean)
				.join(' · ');
		}
		return answer.level ? LEVEL_LABELS[answer.level] : '';
	}

	const shown = $derived(
		Object.entries(catalog.sections).flatMap(([section]) =>
			categories(section)
				.map((category) => ({
					category,
					limited: list.triage[category.id]?.value === 'limit',
					rows: rowsFor(category.id)
				}))
				.filter((entry) => entry.limited || entry.rows.length > 0)
		)
	);
</script>

<div class="shared">
	{#if shown.length === 0}
		<p class="quiet">There are no answers in this list yet.</p>
	{/if}
	{#each shown as { category, limited, rows } (category.id)}
		<section aria-labelledby="shared-{category.id}">
			<h2 id="shared-{category.id}">{category.name}</h2>
			{#if limited}
				<p class="limited">Hard limit: everything here, unless answered otherwise below.</p>
			{/if}
			<dl>
				{#each rows as row (row.key)}
					<div class="row">
						<dt>{row.name}</dt>
						<dd>
							{answerText(row)}
							{#if detailText(row.answer.detail)}
								<span class="detail">{detailText(row.answer.detail)}</span>
							{/if}
							{#if row.answer.note}
								<span class="note">{row.answer.note}</span>
							{/if}
						</dd>
					</div>
				{/each}
			</dl>
		</section>
	{/each}
</div>

<style>
	.shared {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;

		h2 {
			margin: 0 0 0.5rem;
			font-size: 1.1rem;
		}
	}

	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.row {
		display: grid;
		grid-template-columns: minmax(8rem, 1fr) 2fr;
		gap: 0.75rem;
		padding-block-end: 0.5rem;
		border-block-end: var(--wa-border-width-s) solid var(--wa-color-surface-border);
	}

	dt {
		font-weight: var(--wa-font-weight-semibold);
	}

	dd {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.detail,
	.quiet {
		font-size: 0.85rem;
		color: var(--wa-color-text-quiet);
	}

	.note {
		font-style: italic;
		white-space: pre-wrap;
	}

	.limited {
		margin: 0 0 0.5rem;
		color: var(--wa-color-danger-on-quiet);
	}
</style>
