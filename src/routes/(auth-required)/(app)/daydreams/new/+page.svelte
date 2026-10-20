<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import DaydreamSetupForm from '$lib/components/DaydreamSetupForm.svelte';
	import DaydreamStarter from '$lib/components/DaydreamStarter.svelte';
	import ExchangeLog from '$lib/components/ExchangeLog.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SuggestionProblem from '$lib/components/SuggestionProblem.svelte';
	import type { DaydreamSetup, DaydreamVoicePresetId } from '$lib/daydream';
	import type { ExchangeLogView as ChatLog } from '$lib/daydream/exchange-log';
	import {
		assembleSetup,
		type StarterSide,
		starterSetup,
		starterSummary,
		storedStarterSide
	} from '$lib/daydream/starters';
	import { type SuggestFailure, suggestDaydream, suggestIdeas } from '$lib/daydream/suggest';
	import { addIdeas, type GeneratedIdea, MAX_OFFERED_IDEAS } from '$lib/daydream/suggestions';
	import type { MarkedSummary } from '$lib/daydream/summary';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Where the page is: choosing a way in, or setting the daydream up. Kept
	 * on the page rather than in the URL, because a draft is what the user
	 * is making and has no business in their history. `version` remounts the
	 * form for each new draft, which superforms needs to start from it.
	 */
	type Stage =
		| { kind: 'start' }
		| {
				kind: 'setup';
				draft: DaydreamSetup | null;
				/** The model's summary of the draft; null for a ready-made one, or none to read. */
				summary: MarkedSummary | null;
				layout: 'summary' | 'full';
				/** What the model wrote it from, so "Try another" can ask again; null for none. */
				described: Described | null;
				/** How the model wrote it, links read and all, for debug mode; null when not asked for. */
				log: ChatLog | null;
				version: number;
		  };

	/**
	 * The brief a draft is written from, the side it was asked for (or a
	 * generated idea made for), and for a generated idea, the idea itself,
	 * its voice, so the draft is told the way the idea was, and the research
	 * its round of ideas was written with. The brief is always what the user
	 * typed, even for a generated idea, so the draft keeps their own words.
	 */
	type Described = {
		brief: string;
		side: StarterSide | null;
		voice?: DaydreamVoicePresetId | null;
		chosen?: Pick<GeneratedIdea, 'title' | 'premise'>;
		research?: string;
	};

	let stage: Stage = $state({ kind: 'start' });
	let brief = $state('');
	// The load's order, captured once: going back to the ways in shows the
	// stories as they were, and a re-run load must not reshuffle them.
	// svelte-ignore state_referenced_locally
	const { starterOrder } = data;
	let side: StarterSide | null = $state(null);
	let asking = $state(false);
	let problem: SuggestFailure | null = $state(null);
	let generated: {
		brief: string;
		ideas: readonly GeneratedIdea[];
		log?: ChatLog;
	} | null = $state(null);
	let writing: string | null = $state(null);
	let ideaProblem: SuggestFailure | null = $state(null);
	let versions = 0;
	/** Counts draft requests, so only the latest one still wanted is applied. */
	let requests = 0;

	/**
	 * "You as" is remembered on the device, as a convenience: someone who is
	 * always the sub should not have to say so on every visit. Read on mount,
	 * because storage is only there in the browser; the server renders
	 * "Either", which is the right thing to show until then anyway.
	 */
	const SIDE_KEY = 'daydreams.starter-side';
	onMount(() => {
		try {
			side = storedStarterSide(localStorage.getItem(SIDE_KEY));
		} catch {
			// Storage refused (a private window, say): it starts at "Either".
		}
	});
	function chooseSide(value: StarterSide | null) {
		side = value;
		try {
			if (value) {
				localStorage.setItem(SIDE_KEY, value);
			} else {
				localStorage.removeItem(SIDE_KEY);
			}
		} catch {
			// Not remembered, which only costs a tap on the next visit.
		}
	}

	const suggestionsOn = $derived(data.accepted && data.available);

	function setUp(
		draft: DaydreamSetup | null,
		described: Described | null,
		summary: MarkedSummary | null = null,
		log: ChatLog | null = null
	) {
		versions += 1;
		stage = {
			kind: 'setup',
			draft,
			summary,
			layout: draft ? 'summary' : 'full',
			described,
			log,
			version: versions
		};
	}

	/**
	 * Asks the model to put a daydream together from a brief: what was
	 * written in the box, or a generated idea. `limits` are any the user has
	 * written on the setup since, kept on the new draft and told to the
	 * model, so "Try another" never loses them. A failure is said where it
	 * was asked from, which on the setup is above the form.
	 */
	async function writeDraft(
		described: Described,
		limits = '',
		failed: (failure: SuggestFailure) => void = (failure) => {
			problem = failure;
		}
	) {
		requests += 1;
		const mine = requests;
		asking = true;
		problem = null;
		ideaProblem = null;
		const answer = await suggestDaydream({ ...described, limits, debugLog: data.debug });
		// Left behind: the user went back to the start, or asked again, while
		// this was out. Applying it anyway pulled someone who had pressed "Other
		// ways to start" straight back into a draft they had walked away from.
		if (mine !== requests) {
			return;
		}
		asking = false;
		writing = null;
		if (!answer.ok) {
			failed(answer);
			return;
		}
		setUp(
			{ ...assembleSetup(answer.value), limits },
			described,
			answer.value.summary ?? null,
			answer.log ?? null
		);
	}

	/**
	 * "Suggest daydreams for this": a few like the one described in the box, for
	 * the side chosen under "You as". They replace the last ones, and are kept here so going
	 * back to the ways in still shows them.
	 */
	async function generateIdeas(asked: string): Promise<SuggestFailure | null> {
		const answer = await suggestIdeas({ brief: asked, side, limits: '', debugLog: data.debug });
		if (!answer.ok) {
			return answer;
		}
		generated = { brief: asked, ideas: answer.value, log: answer.log };
		ideaProblem = null;
		return null;
	}

	/**
	 * "More ideas": more for the same brief, for the side chosen now, added
	 * after the ones shown. The model is told which it already offered; any it
	 * repeats anyway are dropped, and only repeats is said as nothing new.
	 */
	async function moreIdeas(): Promise<SuggestFailure | null> {
		if (!generated) {
			return null;
		}
		const shown = generated;
		const answer = await suggestIdeas({
			brief: shown.brief,
			side,
			limits: '',
			offered: shown.ideas.map((offered) => offered.title).slice(-MAX_OFFERED_IDEAS),
			debugLog: data.debug
		});
		// Cleared or replaced while this was out: these were for the old ones.
		if (generated !== shown) {
			return null;
		}
		if (!answer.ok) {
			return answer;
		}
		const added = addIdeas(shown.ideas, answer.value);
		if (added.length === shown.ideas.length) {
			return { error: 'No new ideas came back that time. Try again.' };
		}
		generated = { brief: shown.brief, ideas: added, log: answer.log ?? shown.log };
		return null;
	}

	function writeIdea(chosen: GeneratedIdea) {
		if (!generated) {
			return;
		}
		writing = chosen.title;
		// The idea's own side, which is the one it was asked for unless it
		// has no one in charge.
		writeDraft(
			{
				brief: generated.brief,
				side: chosen.you,
				voice: chosen.voice,
				chosen: { title: chosen.title, premise: chosen.premise },
				research: chosen.research
			},
			'',
			(failure) => {
				ideaProblem = failure;
			}
		);
	}
</script>

<section class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/daydreams')}
		backLabel="Back to daydreams"
		backText="Daydreams"
		title="New daydream"
		description={stage.kind === 'start'
			? 'Say what you feel like, or pick one to start from. You can change any of it.'
			: 'Change anything you like, then start. You can change it later too.'}
	/>

	<div class="content">
		{#if stage.kind === 'start'}
			<DaydreamStarter
				bind:brief
				bind:side={() => side, chooseSide}
				{suggestionsOn}
				{starterOrder}
				{asking}
				{problem}
				{generated}
				{writing}
				{ideaProblem}
				debug={data.debug}
				ondescribe={() => writeDraft({ brief, side })}
				onstarter={(starter) => {
					const draft = starterSetup(starter);
					setUp(draft, null, starterSummary(starter, draft));
				}}
				ongenerate={generateIdeas}
				onmore={moreIdeas}
				onclear={() => {
					generated = null;
					ideaProblem = null;
				}}
				onidea={writeIdea}
				onblank={() => setUp(null, null)}
			/>
		{:else}
			<wa-button
				class="back"
				appearance="plain"
				size="s"
				onclick={() => {
					// Drops a "Try another" still out, which would otherwise land
					// here and leave the start saying it was writing one.
					requests += 1;
					asking = false;
					problem = null;
					ideaProblem = null;
					stage = { kind: 'start' };
				}}
			>
				<wa-icon slot="start" name="arrow-left" variant="solid"></wa-icon>
				Other ways to start
			</wa-button>
			{#if problem}<SuggestionProblem {problem} debug={data.debug} />{/if}
			{#if data.debug && stage.log}<ExchangeLog log={stage.log} />{/if}
			{#key stage.version}
				<DaydreamSetupForm
					setupForm={data.setupForm}
					draft={stage.draft}
					summary={stage.summary}
					layout={stage.layout}
					onretry={stage.described
						? (limits) => {
								if (stage.kind === 'setup' && stage.described) {
									writeDraft(stage.described, limits);
								}
							}
						: undefined}
					retrying={asking}
					library={data.library}
					{suggestionsOn}
					picturesAvailable={data.picturesAvailable}
					submitLabel="Start daydreaming"
					debug={data.debug}
				/>
			{/key}
		{/if}
	</div>
</section>

<style>
	.page {
		max-width: 48rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0 var(--wa-space-l) var(--wa-space-l);
	}

	.back {
		align-self: flex-start;
	}
</style>
