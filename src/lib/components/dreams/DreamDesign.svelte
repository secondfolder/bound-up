<script lang="ts">
	import { type BlockDesign, boxOf, type DesignNode, meterOf, slotItems } from '$lib/dream/designs';

	/**
	 * A designed block drawn (docs/dreams.md, "Designed blocks"): the
	 * design's layout, its slots filled with what the passage wrote. Every
	 * part is one of the language's few, drawn in the daydream's theme, so a
	 * design can shape the block but never put anything else on the page.
	 */
	let {
		design,
		slots,
		title = ''
	}: { design: BlockDesign; slots: Readonly<Record<string, string>>; title?: string } = $props();

	const words = (slot: string | undefined) => (slot ? (slots[slot] ?? '') : '');
</script>

{#snippet node(part: DesignNode)}
	{#if part.type === 'stack'}
		<div class="stack" data-align={part.align ?? 'start'} class:border={part.border}>
			{#each part.children as child, index (index)}{@render node(child)}{/each}
		</div>
	{:else if part.type === 'row'}
		<div class="row" data-justify={part.justify ?? 'start'}>
			{#each part.children as child, index (index)}{@render node(child)}{/each}
		</div>
	{:else if part.type === 'grid'}
		<div class="grid" style:--columns={part.columns}>
			{#each part.children as child, index (index)}{@render node(child)}{/each}
		</div>
	{:else if part.type === 'text'}
		{const text = $derived(part.slot ? words(part.slot) : (part.text ?? ''))}
		{#if text}
			<p class="text" data-style={part.style} data-align={part.align ?? 'start'}>{text}</p>
		{/if}
	{:else if part.type === 'pair'}
		<p class="pair"><span class="label">{part.label}</span> <span>{words(part.slot)}</span></p>
	{:else if part.type === 'list'}
		{const items = $derived(slotItems(words(part.slot)))}
		{#if part.numbered}
			<ol class="list">
				{#each items as item, index (index)}<li>{item}</li>{/each}
			</ol>
		{:else}
			<ul class="list">
				{#each items as item, index (index)}<li>{item}</li>{/each}
			</ul>
		{/if}
	{:else if part.type === 'boxes'}
		{const boxes = $derived(slotItems(words(part.slot)).map(boxOf))}
		<ul class="boxes" style:--columns={part.columns ?? Math.min(boxes.length, 7)}>
			{#each boxes as box, index (index)}
				<li class:filled={box.filled}>
					<span class="box" aria-hidden="true"></span>
					<span class="box-label">{box.label}</span>
					<span class="wa-visually-hidden">{box.filled ? ', done' : ''}</span>
				</li>
			{/each}
		</ul>
	{:else if part.type === 'meter'}
		{const meter = $derived(meterOf(words(part.slot), part.max))}
		<div class="meter">
			<wa-progress-bar value={Math.round((meter.value / meter.max) * 100)} label={part.slot}></wa-progress-bar>
			<span class="readout">{meter.value} / {meter.max}</span>
		</div>
	{:else if part.type === 'divider'}
		<hr />
	{/if}
{/snippet}

<section class="designed" data-frame={design.frame} aria-label={title || design.kind.replaceAll('-', ' ')}>
	{#if title}<p class="text" data-style="heading">{title}</p>{/if}
	{@render node(design.layout)}
</section>

<style>
	.designed {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
		margin-block: var(--wa-space-s);
		padding: var(--wa-space-m);
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		background: var(--wa-color-surface-raised);
		color: var(--dream-ink, inherit);
		white-space: normal;
	}

	.designed[data-frame='paper'] {
		border-radius: 2px;
		background: var(--dream-page, var(--wa-color-surface-raised));
		box-shadow: var(--wa-shadow-s);
	}

	.designed[data-frame='ticket'] {
		border-style: dashed;
		border-width: 2px;
		border-color: var(--dream-accent, var(--wa-color-brand-border-loud));
	}

	.designed[data-frame='screen'] {
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-lowered);
		font-family: var(--wa-font-family-code);
	}

	.designed[data-frame='badge'] {
		align-self: flex-start;
		border-radius: var(--wa-border-radius-l);
		border-color: var(--dream-accent, var(--wa-color-brand-border-loud));
	}

	.designed[data-frame='plain'] {
		padding: 0;
		border: 0;
		background: transparent;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);

		&[data-align='center'] {
			align-items: center;
		}

		&[data-align='end'] {
			align-items: flex-end;
		}

		&.border {
			padding: var(--wa-space-xs);
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-s);
		}
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--wa-space-s);

		&[data-justify='center'] {
			justify-content: center;
		}

		&[data-justify='end'] {
			justify-content: flex-end;
		}

		&[data-justify='between'] {
			justify-content: space-between;
		}
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
		gap: var(--wa-space-xs);
	}

	.text {
		margin: 0;
		overflow-wrap: anywhere;

		&[data-align='center'] {
			text-align: center;
		}

		&[data-align='end'] {
			text-align: end;
		}

		&[data-style='title'] {
			font-family: var(--dream-face, inherit);
			font-size: var(--wa-font-size-l);
			font-weight: var(--wa-font-weight-bold);
		}

		&[data-style='heading'] {
			font-weight: var(--wa-font-weight-semibold);
		}

		&[data-style='label'] {
			font-size: var(--wa-font-size-xs);
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: var(--wa-color-text-quiet);
		}

		&[data-style='quiet'] {
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}

		&[data-style='stamp'] {
			align-self: flex-start;
			padding: var(--wa-space-3xs) var(--wa-space-xs);
			border: 2px solid var(--dream-accent, var(--wa-color-brand-border-loud));
			border-radius: var(--wa-border-radius-s);
			color: var(--dream-accent, var(--wa-color-brand-on-quiet));
			font-weight: var(--wa-font-weight-bold);
			letter-spacing: 0.1em;
			text-transform: uppercase;
			transform: rotate(-3deg);
		}

		&[data-style='mono'] {
			font-family: var(--wa-font-family-code);
		}

		&[data-style='script'] {
			font-style: italic;
			font-family: var(--dream-face, inherit);
		}
	}

	.pair {
		margin: 0;

		.label {
			color: var(--wa-color-text-quiet);
		}
	}

	.list {
		margin: 0;
		padding-left: 1.25em;
	}

	.boxes {
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
		gap: var(--wa-space-xs);
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: var(--wa-space-3xs);
			font-size: var(--wa-font-size-xs);
		}

		.box {
			width: 1.5rem;
			height: 1.5rem;
			border: 2px solid var(--dream-accent, var(--wa-color-brand-border-loud));
			border-radius: var(--wa-border-radius-s);
		}

		li.filled .box {
			background: var(--dream-accent, var(--wa-color-brand-fill-loud));
		}
	}

	.meter {
		display: flex;
		align-items: center;
		gap: var(--wa-space-xs);

		wa-progress-bar {
			flex: 1;
			--track-height: 0.5rem;
		}

		.readout {
			font-size: var(--wa-font-size-s);
			font-variant-numeric: tabular-nums;
		}
	}

	hr {
		width: 100%;
		margin: 0;
		border: 0;
		border-top: 1px solid var(--wa-color-surface-border);
	}
</style>
