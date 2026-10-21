<script lang="ts">
	import type { Axis, Catalogue, Combo } from '$lib/prompt-review';
	import { onChoose, onType } from './choose';
	import PromptText from './PromptText.svelte';

	/**
	 * Every distinct paragraph a builder's prompts are made of, once each, with
	 * the options it appears under (docs/prompt-review.md): the place to review
	 * wording. Filtered by text, by an option it depends on, or to those this
	 * device has not marked reviewed — which, since a paragraph's id is its
	 * text, after a prompt change is just what changed.
	 */
	let {
		catalogue,
		reviewed,
		ontoggle,
		onopen
	}: {
		catalogue: Catalogue;
		reviewed: ReadonlySet<string>;
		ontoggle: (id: string) => void;
		onopen: (combo: Combo) => void;
	} = $props();

	let search = $state('');
	let dependsOn = $state('any');
	let unreviewedOnly = $state(false);

	const axes = $derived(new Map<string, Axis>(catalogue.builder.axes.map((axis) => [axis.id, axis])));

	const shown = $derived(
		catalogue.paragraphs.filter(
			(paragraph) =>
				(search.trim() === '' ||
					paragraph.text.toLowerCase().includes(search.trim().toLowerCase())) &&
				(dependsOn === 'any' ||
					(dependsOn === 'none'
						? Object.keys(paragraph.conditions).length === 0
						: paragraph.conditions[dependsOn] !== undefined)) &&
				!(unreviewedOnly && reviewed.has(paragraph.id))
		)
	);
	const reviewedCount = $derived(
		catalogue.paragraphs.filter((paragraph) => reviewed.has(paragraph.id)).length
	);

	function listenForUnreviewed(element: HTMLElement) {
		const listener = () => {
			unreviewedOnly = Boolean((element as HTMLElement & { checked: boolean }).checked);
		};
		element.addEventListener('change', listener);
		return () => element.removeEventListener('change', listener);
	}
</script>

<p class="summary">
	{catalogue.paragraphs.length} paragraphs from {catalogue.distinctPrompts.toLocaleString('en')} distinct
	prompts; {reviewedCount} reviewed on this device.
</p>

<div class="filters">
	<wa-input label="Contains" size="s" with-clear {@attach onType((value) => {
			search = value;
		})}></wa-input>
	<wa-select label="Depends on" size="s" value={dependsOn} {@attach onChoose((value) => {
			dependsOn = value;
		})}>
		<wa-option value="any">Anything</wa-option>
		<wa-option value="none">Nothing: in every prompt</wa-option>
		{#each catalogue.builder.axes as axis (axis.id)}
			<wa-option value={axis.id}>{axis.label}</wa-option>
		{/each}
	</wa-select>
	<wa-switch size="s" {@attach listenForUnreviewed}>Not reviewed only</wa-switch>
</div>

<p class="summary">Showing {shown.length}.</p>

<ol class="paragraphs">
	{#each shown as paragraph (paragraph.id)}
		<li class:reviewed={reviewed.has(paragraph.id)}>
			<div class="meta">
				<span>
					{paragraph.roles.join(', ')} ·
					{#if paragraph.sweptOnly}
						only with one option changed from the baseline
					{:else}
						in {paragraph.count.toLocaleString('en')} of {catalogue.structuralTotal.toLocaleString('en')}
					{/if}
				</span>
				{#each Object.entries(paragraph.conditions) as [axisId, values] (axisId)}
					<wa-badge appearance="outlined" variant="neutral">
						{axes.get(axisId)?.label ?? axisId}: {values.join(', ')}
					</wa-badge>
				{/each}
			</div>
			<pre><PromptText text={paragraph.text} /></pre>
			<div class="actions">
				<!-- A toggle, so a native button: wa-button does not forward
				     aria-pressed to the control inside it (AGENTS.md). -->
				<button type="button" class="mark" aria-pressed={reviewed.has(paragraph.id)} onclick={() => ontoggle(paragraph.id)}>
					<wa-icon
						name={reviewed.has(paragraph.id) ? 'circle-check' : 'circle'}
						variant={reviewed.has(paragraph.id) ? 'solid' : 'regular'}
					></wa-icon>
					Reviewed
				</button>
				<wa-button size="s" appearance="plain" onclick={() => onopen(paragraph.example)}>
					Open a prompt with it
				</wa-button>
			</div>
		</li>
	{/each}
</ol>

<style>
	pre {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-family: var(--wa-font-family-code, monospace);
		font-size: 0.8125rem;
	}

	.summary {
		margin: 0 0 0.75rem;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem;
		margin-block-end: 0.75rem;

		wa-input,
		wa-select {
			flex: 1 1 12rem;
		}
	}

	.paragraphs {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;

		> li {
			padding: 0.5rem 0.75rem;
			border: 1px solid var(--wa-color-surface-border);
			border-inline-start-width: 3px;
			border-radius: var(--wa-border-radius-m);

			&.reviewed {
				border-inline-start-color: var(--wa-color-success-border-loud);

				pre {
					color: var(--wa-color-text-quiet);
				}
			}
		}
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
		margin-block-end: 0.5rem;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-block-start: 0.5rem;
	}

	.mark {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-pill);
		background: none;
		color: var(--wa-color-text-quiet);
		font: inherit;
		font-size: var(--wa-font-size-s);
		cursor: pointer;

		&[aria-pressed='true'] {
			color: var(--wa-color-success-on-quiet);
			border-color: var(--wa-color-success-border-loud);
		}
	}
</style>
