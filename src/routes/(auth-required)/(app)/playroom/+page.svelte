<script lang="ts">
	import { resolve } from '$app/paths';
	import { PLAYROOM_TOOLS, type PlayroomTool } from '$lib/playroom/tools';

	// `resolve()` takes one route at a time, with that route's own params.
	function href(tool: PlayroomTool): string {
		return tool.route === '/(standalone)/playroom/iq-test/[[id]]'
			? resolve(tool.route, {})
			: resolve(tool.route);
	}
</script>

<div class="page">
	<h1>Playroom</h1>
	<p class="intro">Toys and games to play with, alone or with someone else.</p>

	<ul class="tools">
		{#each PLAYROOM_TOOLS as tool (tool.id)}
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
	   carries its own column, as /home/guides does. */
	.page {
		max-width: 800px;
		margin-inline: auto;
		padding: 1em;

		h1 {
			text-align: center;
			margin-block-end: 0.25em;
		}

		.intro {
			text-align: center;
			color: var(--wa-color-text-quiet);
			margin-block-start: 0;
		}
	}

	.tools {
		list-style: none;
		padding: 0;
		margin: 2rem auto 0;
		max-inline-size: 30rem;
		display: grid;
		gap: 1rem;

		a {
			display: grid;
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
