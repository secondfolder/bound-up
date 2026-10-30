<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DaydreamDisclosure from '$lib/components/DaydreamDisclosure.svelte';
	import DreamTextBox from '$lib/components/dreams/DreamTextBox.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { newSetup } from '$lib/dream/setup-flow';
	import { createDream, DreamRequestError } from '$lib/dream-browser/api';
	import { reportRequestFailure } from '$lib/request-failure.svelte';
	import { MAX_BRIEF_CHARS } from '$lib/sealed-kinds/dreams';
	import { openedDreamSetup, openedPart, shownText } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	/**
	 * The new engine's front page (docs/dreams.md): one box for what you feel
	 * like, your limits, and the daydreams so far.
	 */
	let { data }: { data: PageData } = $props();

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	/** A rough size, drawn as a thicker or thinner stack of pages. */
	function sizeOf(passages: number): 'short' | 'medium' | 'long' | 'epic' {
		if (passages <= 3) {
			return 'short';
		}
		if (passages <= 20) {
			return 'medium';
		}
		return passages <= 100 ? 'long' : 'epic';
	}

	async function start(brief: string): Promise<boolean> {
		const id = crypto.randomUUID();
		try {
			await createDream(id, newSetup(brief));
		} catch (cause) {
			reportRequestFailure(cause, cause instanceof DreamRequestError ? cause.message : undefined);
			return false;
		}
		await goto(resolve('/(auth-required)/(app)/dreams/[id]', { id }));
		return true;
	}
</script>

<div class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/playroom')}
		backLabel="Back to the Playroom"
		backText="Playroom"
		title="Daydreams (new)"
	/>

	<div class="content">
		{#if !data.available}
			<wa-callout variant="neutral">
				Daydreams aren't set up on this server yet. Whoever runs it can turn them on.
			</wa-callout>
		{:else if !data.accepted}
			<DaydreamDisclosure action={`${resolve('/(auth-required)/(app)/dreams')}?/acceptDisclosure`} />
		{:else}
			<section aria-labelledby="new-heading">
				<h2 id="new-heading">New daydream</h2>
				<DreamTextBox
					id="dream-brief"
					label="What do you feel like?"
					placeholder="Anything: a dynamic, a scene, a form, a link to something you like"
					max={MAX_BRIEF_CHARS}
					draft={{ kind: 'dream-brief' }}
					submitLabel="Start"
					rows={3}
					onsend={start}
				/>
			</section>

			<p class="keep">
				<a href={resolve('/(auth-required)/(app)/dreams/preferences')}>What I keep in mind</a>: your limits,
				and what your daydreams have remembered about what you like.
			</p>

			{#if data.dreams.length > 0}
				<ul class="dreams">
					{#each data.dreams as dream (dream.id)}
						{const setup = $derived(openedDreamSetup(dream.setup))}
						<!-- Still being set up, or built and not yet started: a draft. -->
						{const draft = $derived(
							!dream.lastTurnAt || Boolean(setup?.awaitingStart)
						)}
						<li class:draft>
							<a href={resolve('/(auth-required)/(app)/dreams/[id]', { id: dream.id })}>
								<span class="title">
									{shownText(openedPart(setup, (value) => value.build?.title ?? value.brief))}
								</span>
								<span class="detail">
									{#if draft}
										<span class="draft-mark"
											><wa-icon name="pen-ruler" aria-hidden="true"></wa-icon> Draft, still being set up</span
										>
									{:else}
										<span>played {dateFormat.format(dream.lastTurnAt ?? dream.createdAt)}</span>
										<!-- How much there is to it, at a glance. -->
										<span class="size" data-size={sizeOf(dream.passages)}>
											<span class="pages" aria-hidden="true"></span>
											{dream.passages}
											{dream.passages === 1 ? 'passage' : 'passages'}
										</span>
									{/if}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		max-width: var(--page-width);
		width: 100%;
		margin-inline: auto;
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-l);
		padding: 0 var(--page-gutter) var(--wa-space-xl);

		h2 {
			margin: 0 0 var(--wa-space-s);
			font-size: var(--wa-font-size-m);
		}
	}

	.keep {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}

	.dreams {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);

		a {
			display: flex;
			flex-direction: column;
			padding: var(--wa-space-s) var(--wa-space-m);
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-m);
			color: inherit;
			text-decoration: none;
		}

		.detail {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--wa-space-2xs) var(--wa-space-s);
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}

		/* A draft looks unfinished: dashed, quieter, its brief in italics. */
		li.draft a {
			border-style: dashed;
			background: transparent;

			.title {
				font-style: italic;
				color: var(--wa-color-text-quiet);
			}
		}

		.draft-mark {
			display: inline-flex;
			align-items: center;
			gap: var(--wa-space-3xs);
		}

		.size {
			display: inline-flex;
			align-items: center;
			gap: var(--wa-space-2xs);
		}

		/* A stack of pages, thicker the more there is. */
		.pages {
			width: 0.9rem;
			height: 0.25rem;
			border-radius: 1px;
			background: var(--wa-color-text-quiet);
			box-shadow: none;
		}

		.size[data-size='medium'] .pages {
			box-shadow: 0 -0.35rem 0 var(--wa-color-text-quiet);
			margin-top: 0.35rem;
		}

		.size[data-size='long'] .pages {
			box-shadow:
				0 -0.35rem 0 var(--wa-color-text-quiet),
				0 -0.7rem 0 var(--wa-color-text-quiet);
			margin-top: 0.7rem;
		}

		.size[data-size='epic'] .pages {
			box-shadow:
				0 -0.35rem 0 var(--wa-color-text-quiet),
				0 -0.7rem 0 var(--wa-color-text-quiet),
				0 -1.05rem 0 var(--wa-color-text-quiet);
			margin-top: 1.05rem;
		}
	}
</style>
