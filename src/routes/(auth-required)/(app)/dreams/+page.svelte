<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DaydreamDisclosure from '$lib/components/DaydreamDisclosure.svelte';
	import DreamTextBox from '$lib/components/dreams/DreamTextBox.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { newSetup } from '$lib/dream/setup-flow';
	import {
		createDream,
		DreamRequestError,
		readPreferences,
		savePreferences
	} from '$lib/dream-browser/api';
	import { reportRequestFailure } from '$lib/request-failure.svelte';
	import {
		type DreamPreference,
		MAX_BRIEF_CHARS,
		MAX_PREFERENCE_CHARS
	} from '$lib/sealed-kinds/dreams';
	import { openedDreamSetup, openedPart, shownText } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	/**
	 * The new engine's front page (docs/dreams.md): one box for what you feel
	 * like, your limits, and the daydreams so far.
	 */
	let { data }: { data: PageData } = $props();

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	let preferences = $state<DreamPreference[] | null>(null);
	let revision = $state<number | null>(null);
	let limitsProblem = $state<string | null>(null);
	const limits = $derived((preferences ?? []).filter((entry) => entry.firmness === 'hard'));

	// Once the disclosure is accepted, which may be after the page loaded.
	const ready = $derived(data.available && data.accepted);
	$effect(() => {
		if (!ready || preferences !== null) {
			return;
		}
		readPreferences()
			.then((stored) => {
				({ revision } = stored);
				({ preferences } = stored.preferences);
			})
			.catch((cause: unknown) => reportRequestFailure(cause));
	});

	async function saveLimits(next: DreamPreference[]): Promise<boolean> {
		limitsProblem = null;
		try {
			revision = await savePreferences(data.userId, { preferences: next }, revision);
			preferences = next;
			return true;
		} catch (cause) {
			limitsProblem =
				cause instanceof DreamRequestError ? cause.message : 'Your limits could not be saved.';
			return false;
		}
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

			<wa-details summary={`Your limits${limits.length > 0 ? ` (${limits.length})` : ''}`}>
				<div class="limits">
					<p class="quiet">
						Every daydream is asked never to go near these. They're followed as closely as the model can
						manage, not guaranteed.
					</p>
					{#if preferences === null}
						<wa-skeleton effect="sheen"></wa-skeleton>
					{:else if limits.length > 0}
						<ul>
							{#each limits as limit (limit.id)}
								<li>
									<span>{limit.text}</span>
									<wa-button
										size="s"
										appearance="plain"
										onclick={() =>
											saveLimits((preferences ?? []).filter((entry) => entry.id !== limit.id))}
									>
										<wa-icon name="xmark" label={`Remove “${limit.text}”`}></wa-icon>
									</wa-button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if limitsProblem}<wa-callout variant="danger">{limitsProblem}</wa-callout>{/if}
					<DreamTextBox
						id="dream-limit"
						label="Add a limit"
						placeholder="Never…"
						max={MAX_PREFERENCE_CHARS}
						draft={{ kind: 'dream-limit' }}
						submitLabel="Add"
						rows={1}
						disabled={preferences === null}
						onsend={(text) =>
							saveLimits([
								...(preferences ?? []),
								{
									id: crypto.randomUUID().slice(0, 8),
									text,
									firmness: 'hard',
									appliesTo: '',
									source: 'typed'
								}
							])}
					/>
				</div>
			</wa-details>

			{#if data.dreams.length > 0}
				<ul class="dreams">
					{#each data.dreams as dream (dream.id)}
						{const setup = $derived(openedDreamSetup(dream.setup))}
						<li>
							<a href={resolve('/(auth-required)/(app)/dreams/[id]', { id: dream.id })}>
								<span class="title">
									{shownText(openedPart(setup, (value) => value.build?.title ?? value.brief))}
								</span>
								<span class="detail">
									{dream.lastTurnAt ? `played ${dateFormat.format(dream.lastTurnAt)}` : 'being set up'}
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

	.quiet {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}

	.limits {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);

		ul {
			margin: 0;
			padding: 0;
			list-style: none;
		}

		li {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--wa-space-s);
		}
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
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}
	}
</style>
