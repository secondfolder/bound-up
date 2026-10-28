<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { type PlayroomTool, playroomToolsFor } from '$lib/playroom/tools';

	// The app shell's features decide what is listed and nothing more: a
	// tool behind one checks for it in its own loads (docs/features-and-admin.md).
	const tools = $derived(playroomToolsFor(page.data.features ?? []));

	// `resolve()` takes one route at a time, with that route's own params.
	function href(tool: PlayroomTool): string {
		return tool.route === '/(standalone)/playroom/iq-test/[[id]]'
			? resolve(tool.route, {})
			: resolve(tool.route);
	}
</script>

<div class="page">
	<h1>Playroom</h1>

	<ul class="tools">
		{#each tools as tool (tool.id)}
			<li>
				<!--
					A plain link rather than a wa-card with an onclick: the whole card is
					the target, and a link is what it is.
				-->
				<a href={href(tool)}>
					<wa-icon name={tool.icon} variant="solid"></wa-icon>
					<span class="name">{tool.name}</span>
					<span class="blurb">{tool.blurb}</span>
				</a>
			</li>
		{/each}
	</ul>
</div>

<style>
	/* The app shell's <main> is the full-width scroll container, so the page
	   carries its own column, as /guides does. */
	.page {
		max-width: var(--page-width);
		margin-inline: auto;
		padding: var(--wa-space-m) var(--page-gutter);

		h1 {
			text-align: center;
			margin-block-end: 0;
		}
	}

	/* Tiles side by side where there is room, one to a row on a phone: a
	   single 30rem column left most of a wide screen empty, and will not hold
	   more than a handful of tools. Each tile fills its cell's height, so a
	   row of them lines up whatever their blurbs' lengths. */
	.tools {
		list-style: none;
		padding: 0;
		margin: 2rem 0 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
		gap: 1rem;

		li {
			display: flex;
		}

		a {
			flex: 1 1 auto;
			display: grid;
			align-content: center;
			grid-template-columns: auto 1fr;
			column-gap: 1rem;
			row-gap: 0.25rem;
			align-items: center;
			padding: 1rem 1.25rem;
			border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-l);
			background: var(--wa-color-surface-default);
			color: inherit;
			text-decoration: none;

			&:hover,
			&:focus-visible {
				border-color: var(--wa-color-brand-border-loud);
			}

			@media (prefers-reduced-motion: no-preference) {
				transition:
					border-color 120ms ease-out,
					translate 120ms ease-out;

				&:hover {
					translate: 0 -2px;
				}
			}

			wa-icon {
				grid-row: span 2;
				font-size: 1.75rem;
				color: var(--wa-color-brand-on-quiet);
			}

			.name {
				font-weight: 700;
				font-size: 1.1rem;
			}

			.blurb {
				color: var(--wa-color-text-quiet);
				font-size: 0.9rem;
			}
		}
	}
</style>
