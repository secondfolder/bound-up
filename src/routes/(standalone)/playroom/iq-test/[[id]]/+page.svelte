<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import FlashLayer from '$lib/components/iq-test/FlashLayer.svelte';
	import HypnoPlayer from '$lib/components/iq-test/HypnoPlayer.svelte';
	import MediaDock from '$lib/components/iq-test/MediaDock.svelte';
	import PornLayout from '$lib/components/iq-test/PornLayout.svelte';
	import type { Phase } from '$lib/components/iq-test/QuestionCard.svelte';
	import QuestionView from '$lib/components/iq-test/QuestionView.svelte';
	import ResultHistory from '$lib/components/iq-test/ResultHistory.svelte';
	import Results from '$lib/components/iq-test/Results.svelte';
	import type { SettingsChoice } from '$lib/components/iq-test/SettingsFields.svelte';
	import SetupDialog from '$lib/components/iq-test/SetupDialog.svelte';
	import { type Analysis, analyse } from '$lib/playroom/iq-test/analysis';
	import {
		brandFor,
		enoughBannerFor,
		flashTauntsFor,
		introFor,
		skippedNoteFor,
		tauntsFor
	} from '$lib/playroom/iq-test/copy';
	import { darkPreference } from '$lib/playroom/iq-test/dark-preference.svelte';
	import {
		localId,
		markDialogSeen,
		markRoleChosen,
		rememberedHypnoCategories,
		rememberedHypnoSource,
		rememberedSettings,
		rememberHypnoCategories,
		rememberHypnoSource,
		rememberSettings,
		rememberTimersCleared,
		roleChosen,
		savedRun,
		saveRun,
		timersCleared
	} from '$lib/playroom/iq-test/device';
	import {
		fullscreenSupported,
		isFullscreen,
		toggleFullscreen,
		watchFullscreen
	} from '$lib/playroom/iq-test/fullscreen.svelte';
	import { categoryTier, type HypnoSource, hypnoSourceFor } from '$lib/playroom/iq-test/hypno';
	import { HypnoSession } from '$lib/playroom/iq-test/hypno-session.svelte';
	import { hypnoSlot } from '$lib/playroom/iq-test/hypno-video-host';
	import { hasMedia } from '$lib/playroom/iq-test/media';
	import { PornFeed } from '$lib/playroom/iq-test/porn-feed.svelte';
	import { newSeed } from '$lib/playroom/iq-test/random';
	import { ResultBook } from '$lib/playroom/iq-test/result-book.svelte';
	import {
		answer,
		attemptedCount,
		back,
		createRun,
		dismissEnough,
		RUN_LENGTH,
		type Run,
		returnToSkipped,
		skip,
		withClockLeft,
		withSettings
	} from '$lib/playroom/iq-test/run';
	import { percentileOf, type Score, scoreRun } from '$lib/playroom/iq-test/scoring';
	import {
		DEFAULT_SETTINGS,
		effectiveIqs,
		effectiveVibe,
		flashes,
		humiliates,
		looksThemed,
		playsBackdrop,
		playsHypno,
		type Settings,
		showsPorn
	} from '$lib/playroom/iq-test/settings';
	import {
		soundReachesClips,
		soundVolume,
		toggleMuted,
		unmuteFromGesture
	} from '$lib/playroom/iq-test/sound.svelte';
	import { schemeClass, themeFor, themeStyle } from '$lib/playroom/iq-test/themes';
	import { wideWindow } from '$lib/playroom/iq-test/wide-window.svelte';
	import type { IqTestResultView } from '$lib/types';

	/**
	 * The IQ test: the stage it is at (intro, questions, results), the run,
	 * the settings and the setup dialog. What surrounds the question is its
	 * own: the porn around it (`PornLayout`), the dock at the foot
	 * (`MediaDock`), the feed of pictures (`PornFeed`) and the results kept
	 * (`ResultBook`).
	 */
	let { data } = $props();

	const signedIn = $derived(data.user !== null);

	type Stage = 'intro' | 'questions' | 'results';
	type Outcome = { score: Score; analysis: Analysis };

	/**
	 * The settings a stored result was taken under, as far as its results
	 * screen needs: the two toggles it depends on are kept with it, and the
	 * rest only shaped the run.
	 */
	function settingsOf(result: IqTestResultView): Settings {
		const { role, intensity, vibe, soberIq, targetIq, humiliating, themedLook } = result;
		return {
			...DEFAULT_SETTINGS,
			role,
			intensity,
			vibe,
			soberIq,
			targetIq,
			humiliating,
			themedLook
		};
	}

	/** The results screen for a result read back from its link. */
	function outcomeOf(result: IqTestResultView): Outcome {
		const score: Score = {
			iq: result.iq,
			percentile: percentileOf(result.iq),
			correct: result.correct,
			attempted: result.attempted,
			skipped: result.skipped
		};
		return { score, analysis: analyse(score, settingsOf(result)) };
	}

	/**
	 * A result opened by its link is shown from the first paint, in the look it
	 * was taken in. Its settings are only borrowed: they are never remembered
	 * as the viewer's own.
	 */
	// svelte-ignore state_referenced_locally
	const opened = data.shared;
	let settings = $state<Settings>(opened ? settingsOf(opened.result) : DEFAULT_SETTINGS);
	let stage = $state<Stage>(opened ? 'results' : 'intro');
	let run = $state<Run | null>(null);
	/** The "Clear timer" testing aid, as last left on this device; read on mount. */
	let clearTimer = $state(false);
	let phase = $state<Phase>('answer');
	let outcome = $state<Outcome | null>(opened ? outcomeOf(opened.result) : null);

	/**
	 * Whether the result on screen is the viewer's own, so it shows their
	 * history beside it. Someone else's, opened from a shared link, shows the
	 * score and a way to take the test instead.
	 */
	// svelte-ignore state_referenced_locally
	let resultIsMine = $state(opened ? opened.isMine : true);

	/**
	 * The id or token of the result this page just finished and navigated to,
	 * so the load that the navigation re-runs does not show it a second time.
	 */
	let finishedId: string | null = null;

	/**
	 * The dialog opens at the start of each visit — each browser session — and
	 * again from the intro's settings button, but not on a reload once it has
	 * been dealt with (see `DIALOG_SEEN_COOKIE`), and never over a result opened
	 * by its link. When it does open, it is open from the start, so the server
	 * renders it and it covers the page from the first paint; the remembered
	 * settings reach it on mount.
	 */
	// svelte-ignore state_referenced_locally
	let dialogOpen = $state(!data.dialogSeen);
	let dialogKey = $state(0);
	/**
	 * Whether the dialog may be closed without choosing a role: only once one
	 * has been chosen on this device. Read on mount, so the server's render,
	 * which cannot know, offers no way out.
	 */
	let dialogClosable = $state(false);
	/**
	 * The intro's "Open in full screen" box: ticked exactly while the page is
	 * fullscreen. Ticking it goes fullscreen there and then — the change is
	 * a gesture, which a browser grants it to — and unticking leaves. Leaving
	 * any other way (Escape, the browser's own control, the dock) unticks it,
	 * since it reads the real state rather than holding its own.
	 *
	 * By hand, not `onchange=`: the box's events come from its shadow root,
	 * which Svelte's delegated handlers do not reliably see (see AGENTS.md).
	 */
	function fullscreenBox(node: HTMLElement & { checked: boolean }) {
		const onChange = () => {
			if (node.checked !== isFullscreen()) {
				toggleFullscreen();
			}
			// Back to the truth until the browser says otherwise: a refused
			// request leaves it unticked.
			node.checked = isFullscreen();
		};
		node.addEventListener('change', onChange);
		$effect(() => {
			node.checked = isFullscreen();
		});
		return () => node.removeEventListener('change', onChange);
	}

	// svelte-ignore state_referenced_locally
	const book = new ResultBook(() => signedIn, data.history ?? []);
	const porn = new PornFeed();

	/** A run from before a reload, offered back if the settings match. */
	let resumable = $state<Run | null>(null);

	/**
	 * False until storage has been read. Until then the page cannot know
	 * whether a reload is resuming a run, so it draws an empty sheet rather
	 * than an intro that would flash up and vanish.
	 */
	let mounted = $state(false);

	onMount(() => {
		const stopWatching = watchFullscreen();
		dialogClosable = roleChosen();
		preferredSource = rememberedHypnoSource();
		book.readDevice();
		if (opened) {
			// A signed-out result is the viewer's own if this device kept it.
			if (!opened.isMine && opened.result.shareToken) {
				resultIsMine = book.kept(opened.result.shareToken);
			}
			mounted = true;
			return stopWatching;
		}
		settings = rememberedSettings();
		clearTimer = timersCleared();
		resumable = savedRun();
		// A reload mid-test goes straight back to the question it was on. Only
		// when the dialog is not up: a new visit starts from the disclaimer,
		// and offers the run back on the intro as "Carry on" once it is closed.
		if (resumable && !dialogOpen) {
			({ settings } = resumable);
			run = resumable;
			resumable = null;
			stage = 'questions';
		}
		hypnoAllowed = true;
		// Back mid-test after a reload: carry on, muted — there was no click to
		// let it be heard. The toggle or the slider brings the sound back.
		if (stage === 'questions') {
			hypno?.resume();
		}
		mounted = true;
		return stopWatching;
	});

	/**
	 * A result arriving by navigation rather than on first load: the browser's
	 * back and forward buttons between results. Keyed on the id, a primitive,
	 * so a load re-run for the same result changes nothing (see AGENTS.md on
	 * effects that read `data`).
	 */
	const sharedId = $derived(data.shared?.result.id ?? null);
	let lastShared: string | null = opened?.result.id ?? null;
	$effect(() => {
		const id = sharedId;
		// Only the id is the trigger: reading the stage here as well re-ran this
		// the moment a run finished, and sent the score back to the intro.
		untrack(() => showShared(id));
	});

	function showShared(id: string | null) {
		if (id === lastShared) {
			return;
		}
		lastShared = id;
		if (id === null) {
			// Back from a result's link to the bare page.
			if (stage === 'results') {
				stage = 'intro';
				outcome = null;
			}
			return;
		}
		const { shared } = data;
		if (id === finishedId || !shared) {
			return;
		}
		settings = settingsOf(shared.result);
		outcome = outcomeOf(shared.result);
		resultIsMine = shared.isMine || book.kept(id);
		stage = 'results';
	}

	/**
	 * Whether a hypno may be made at all: not before storage is read, nor for
	 * someone else's result opened by its link, until the viewer starts or
	 * sets up a test of their own.
	 */
	let hypnoAllowed = $state(false);
	/** Bambi's hypno source, as switched to in the hypno panel and remembered on the device. */
	let preferredSource = $state<HypnoSource | null>(null);
	const hypnoSource = $derived(hypnoSourceFor(settings.vibe, preferredSource));
	/**
	 * What the hypno plays from, as a key: the source, PMVHaven's vibe, or
	 * bambicloud's tier, since a run with porn and one without draw on
	 * different categories. None while the settings call for no hypno
	 * (`playsHypno`).
	 */
	const hypnoKey = $derived.by(() => {
		if (!(hypnoAllowed && playsHypno(settings))) {
			return null;
		}
		return hypnoSource === 'pmvhaven'
			? `pmvhaven:${settings.vibe}`
			: `bambicloud:${categoryTier(settings)}`;
	});
	/**
	 * The hypno, made afresh whenever its key changes. Derived, so it is made
	 * the moment it is read after the settings change — inside the click that
	 * changed them — and `startFromGesture()` can be called on it there: a
	 * browser lets sound start only from a gesture. Its first pick is fetched
	 * at once, so it is ready to play by the time the test starts.
	 */
	const hypno = $derived.by(() => {
		if (hypnoKey === null) {
			return null;
		}
		return untrack(() => {
			const session = new HypnoSession(
				rememberedHypnoCategories(settings),
				hypnoSource,
				settings.vibe
			);
			// After this derived: the fetch writes the session's own state.
			queueMicrotask(() => void session.next());
			return session;
		});
	});

	/** The bambi vibe's switch between its two sources, from a click in the hypno panel. */
	function switchSource(source: HypnoSource) {
		const wasStarted = hypno?.started === true;
		preferredSource = source;
		rememberHypnoSource(source);
		if (wasStarted) {
			hypno?.startFromGesture();
		}
	}

	const theme = $derived(themeFor(settings, darkPreference.current));
	const brand = $derived(brandFor(settings));
	const intro = $derived(introFor(settings));
	const taunts = $derived(tauntsFor(settings));
	const flashTaunts = $derived(flashTauntsFor(settings));
	/**
	 * The hypno's controls: once it has started, on every stage, so it can
	 * always be stopped — it plays on through the results and a start-over.
	 */
	const showHypnoControls = $derived(hypno?.started === true);
	/** The hypno started but held paused at zero volume: its Play shows. */
	const hypnoSilenced = $derived(hypno?.started === true && soundVolume('hypno') === 0);
	const showMedia = $derived(showsPorn(settings));
	const showColumns = $derived(showMedia && stage === 'questions');
	const showPornControls = $derived(showColumns && hasMedia(porn.feed));
	/**
	 * The settings tab: during the questions, while the dialog is not up. Not
	 * on the intro, which has its own Settings button; not on the results,
	 * where a run is over and there is nothing left to set — except in
	 * fullscreen, where it is the way back out.
	 */
	const showSettings = $derived(
		!dialogOpen && (stage === 'questions' || (stage === 'results' && isFullscreen()))
	);
	const showDock = $derived(showHypnoControls || showPornControls || showSettings);
	/**
	 * Only offer a volume when there is a clip it could reach: one with sound,
	 * playing as the page's own video rather than fallen back to Redgifs'
	 * player, which the volume cannot touch.
	 */
	const hasSoundClips = $derived(
		soundReachesClips() &&
			settings.pornMedia !== 'images' &&
			porn.feed.clips.some((clip) => clip.sound && clip.video !== null)
	);

	/**
	 * A change made in the dock's settings, applied to the run as it goes:
	 * the look and the pictures change at once, and questions not yet dealt
	 * are dealt under the new settings — and, if the wording changed, every
	 * one not yet answered is dealt again in it (see `withSettings`). The
	 * role is not among them — it is chosen by starting the test.
	 */
	function changeSettings(choice: SettingsChoice) {
		const before = hypno;
		settings = { ...choice, role: settings.role };
		rememberSettings(settings);
		if (run) {
			update(withSettings(run, settings));
		}
		// A change is a click or a drag, so a hypno the new settings call for
		// may start being heard from it, as one does from the start button.
		if (hypno && hypno !== before && stage === 'questions') {
			hypno.startFromGesture();
		}
	}

	const progress = $derived(run ? run.index / RUN_LENGTH : 0);
	const taunt = $derived(
		taunts.length > 0 && run ? (taunts[run.index % taunts.length] ?? null) : null
	);
	/**
	 * Paint `<html>` and `<body>` to match, so the overscroll area is not the
	 * app's rust wash. Inline styles rather than a style element in the head, which
	 * cannot interpolate, and only after mount: before it, the wrapper already
	 * covers the window.
	 */
	$effect(() => {
		const { canvas } = theme;
		const targets = [document.documentElement, document.body];
		for (const target of targets) {
			target.style.background = canvas;
		}
		return () => {
			for (const target of targets) {
				target.style.removeProperty('background');
			}
		};
	});

	// The pictures, for a run that shows porn. Keyed on a derived primitive,
	// not on `settings`: starting the test assigns a new settings object with
	// the same vibe, and an effect reading through the object re-ran on it,
	// fetching the feed — and every clip — twice. A derived string stops
	// propagating when it is unchanged.
	const mediaVibe = $derived(showMedia ? settings.vibe : null);
	$effect(() => porn.follow(mediaVibe));

	function sameSettings(a: Settings, b: Settings): boolean {
		return (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).every((key) => a[key] === b[key]);
	}

	/**
	 * The intro's "Sound on" box, for settings with a hypno or porn: ticked
	 * to start with, so a start from the setup dialog's role buttons, which
	 * have no box of their own, has sound too. Starting the test with it ticked turns the hypno's and the
	 * clips' sound on, inside the click that starts it — a browser lets sound
	 * start only from a gesture, and there may not be another before the
	 * first clip plays. Unticked, both start muted, and their toggles and
	 * sliders bring them up later. Not remembered: it is asked each time.
	 */
	let soundOn = $state(true);
	const offersSound = $derived(showsPorn(settings) || playsHypno(settings));

	/** By hand, not `onchange=`: the box's events come from its shadow root (see AGENTS.md). */
	function soundBox(node: HTMLElement & { checked: boolean }) {
		const onChange = () => {
			soundOn = node.checked;
		};
		node.addEventListener('change', onChange);
		return () => node.removeEventListener('change', onChange);
	}

	function begin() {
		hypnoAllowed = true;
		if (soundOn) {
			hypno?.startFromGesture();
			unmuteFromGesture('clips');
		} else {
			hypno?.resume();
		}
		rememberSettings(settings);
		run =
			resumable && sameSettings(resumable.settings, settings)
				? resumable
				: createRun(settings, newSeed());
		resumable = null;
		outcome = null;
		book.reset();
		stage = 'questions';
		saveRun(run);
	}

	function onstart(chosen: Settings) {
		markRoleChosen();
		dialogClosable = true;
		settings = chosen;
		dialogOpen = false;
		markDialogSeen();
		begin();
	}

	function onclose(chosen: Settings) {
		settings = chosen;
		rememberSettings(chosen);
		dialogOpen = false;
		markDialogSeen();
		hypnoAllowed = true;
	}

	function openSettings() {
		dialogKey += 1;
		dialogOpen = true;
	}

	function update(next: Run) {
		run = next;
		saveRun(next);
	}

	/**
	 * Back from the first question, out to the intro. A run with anything
	 * answered is kept, and offered back as "Carry on"; one with nothing in it
	 * is dropped, so the intro offers a fresh start.
	 */
	function exitToIntro() {
		if (!run) {
			return;
		}
		const keep = attemptedCount(run) > 0;
		resumable = keep ? run : null;
		saveRun(keep ? run : null);
		run = null;
		stage = 'intro';
	}

	function finish() {
		if (!run) {
			return;
		}
		const score = scoreRun(run);
		outcome = { score, analysis: analyse(score, run.settings) };
		resultIsMine = true;
		// Show the score before anything else. Everything after this is
		// bookkeeping, and a failure in it once left the button doing nothing at
		// all; the score on screen is the part that cannot be allowed to fail.
		stage = 'results';
		const result: IqTestResultView = {
			id: localId(),
			role: run.settings.role,
			intensity: run.settings.intensity,
			vibe: effectiveVibe(run.settings),
			iq: score.iq,
			correct: score.correct,
			attempted: score.attempted,
			skipped: score.skipped,
			humiliating: humiliates(run.settings),
			themedLook: looksThemed(run.settings),
			...effectiveIqs(run.settings),
			createdAt: new Date()
		};
		const { seed } = run;
		saveRun(null);
		void book.record(result, seed).then(showAt);
	}

	/**
	 * The result's own page, which the URL moves to once it has one: an
	 * account's row id, or a device result's signed token. Nothing for a
	 * result that could not be kept, which offers a retry instead.
	 */
	function showAt(id: string | null) {
		if (id === null) {
			return;
		}
		finishedId = id;
		void goto(resolve('/(standalone)/playroom/iq-test/[[id]]', { id }), {
			noScroll: true,
			keepFocus: true
		});
	}

	function retrySave() {
		void book.retry().then(showAt);
	}

	/**
	 * Back to the setup dialog, wherever the taker is: the footer's "start
	 * over", "take it again" on the results, and "take the test yourself" on
	 * someone else's. A run in progress is dropped, not kept for "carry on" —
	 * starting over is what was asked for. From a result's own page, back to
	 * the bare one, and to the viewer's own settings rather than the result's.
	 */
	function startOver() {
		run = null;
		resumable = null;
		saveRun(null);
		outcome = null;
		stage = 'intro';
		if (page.params.id) {
			finishedId = null;
			settings = rememberedSettings();
			void goto(resolve('/(standalone)/playroom/iq-test/[[id]]', {}), { noScroll: true });
		}
		openSettings();
	}
</script>

<svelte:head>
	<title>{brand.title}</title>
</svelte:head>

<!--
	The PMVHaven hypno, as one of the porn videos at the top of the first
	column. Its video is moved in here and back out (see hypno-video-host.ts),
	so it plays straight on.

	At zero volume the sound module pauses it (`data-pause-when-silent`), which
	left a still frame that looked broken. A play symbol in the middle says why
	while its buttons are out of sight; once they show, it gives way to a Play
	among them (`hypnoControls`), the one button that does it. The symbol is
	only a picture, and takes no pointer: a tap on it is a tap on the item,
	which shows the buttons on a touchscreen. A sibling of the slot rather than
	its wrapper, which the column sizes the slot by; the item it sits in is
	the positioned box.
-->
{#snippet hypnoLead()}
	<div class="hypno-slot" {@attach hypnoSlot}></div>
	{#if hypnoSilenced}
		<span class="hypno-paused" aria-hidden="true" data-testid="hypno-paused">
			<wa-icon name="play" variant="solid"></wa-icon>
		</span>
	{/if}
{/snippet}

<!-- Native, like the column's own buttons beside it (see `MediaPanel`). -->
{#snippet hypnoControls()}
	{#if hypnoSilenced}
		<button
			type="button"
			class="control"
			aria-label="Play the hypno"
			data-caption="Turn the hypno's sound back on, which plays it"
			onclick={() => toggleMuted('hypno')}
		>
			<wa-icon name="play" variant="solid"></wa-icon>
		</button>
	{/if}
{/snippet}

<!--
	The footer: under the whole page, or, with porn down both sides, at the
	foot of the middle column, so a question that fits the window leaves
	nothing to scroll (see `PornLayout`).
-->
{#snippet pageFooter()}
	<footer>
		<span class="footer-links">
			{#if !dialogOpen}
				<!--
					Small on purpose: always within reach, never in the way. A
					plain button styled as a link, because it acts on the page rather
					than going anywhere.
				-->
				<button type="button" class="start-over" onclick={startOver}>Start over</button>
				<span aria-hidden="true">·</span>
			{/if}
			<a href={resolve('/')}>Part of the Bound Up kink app</a>
		</span>
	</footer>
{/snippet}

<div
	class="iq-test {schemeClass(theme)}"
	class:with-dock={showDock}
	class:wide-columns={showColumns && wideWindow.current}
	style={themeStyle(theme)}
	data-intensity={settings.intensity}
>
	{#if hypno}
		<HypnoPlayer session={hypno} />
	{/if}

	<PornLayout
		feed={porn.feed}
		intensity={settings.intensity}
		media={settings.pornMedia}
		show={showColumns}
		backdrop={playsBackdrop(settings) && stage === 'questions'}
		docked={showDock}
		lead={hypno?.source === 'pmvhaven' && hypno.current ? hypnoLead : undefined}
		leadControls={hypnoControls}
		leadOrigin={hypno?.current ? { title: hypno.current.name, page: hypno.current.pageUrl } : null}
		footer={pageFooter}
	>
		<header class="brand">
			<span class="issuer">{brand.issuer}</span>
			<h1>{brand.title}</h1>
			<p class="tagline">{brand.tagline}</p>
		</header>

		<div class="sheet">
			{#if stage === 'questions' && run}
				<QuestionView
					{run}
					{taunt}
					answerButton={data.debug}
					timersCleared={clearTimer}
					enoughBanner={enoughBannerFor(settings)}
					skippedNote={(count) => skippedNoteFor(settings, count)}
					onanswer={(response) => run && update(answer(run, response))}
					onskip={() => run && update(skip(run))}
					onback={() => run && update(back(run))}
					onexit={exitToIntro}
					onreturn={() => run && update(returnToSkipped(run))}
					ondismiss={() => run && update(dismissEnough(run))}
					onfinish={finish}
					onphase={(next) => {
						phase = next;
					}}
					onclock={(clock) => run && update(withClockLeft(run, clock))}
					ontimerscleared={(cleared) => {
						clearTimer = cleared;
						rememberTimersCleared(cleared);
					}}
				/>
			{:else if stage === 'results' && outcome}
				{#if resultIsMine}
					<Results score={outcome.score} analysis={outcome.analysis} onretake={startOver}>
						{#snippet history()}
							{#if book.saveState === 'saving' && signedIn}
								<p class="save-note">Saving to your account…</p>
							{:else if book.saveState === 'failed'}
								<wa-callout variant="danger" class="save-note">
									{signedIn
										? "Couldn't save this result to your account."
										: "Couldn't make a link to share this result."}
									<wa-button size="s" appearance="outlined" onclick={retrySave}
										>Try again</wa-button
									>
								</wa-callout>
							{/if}
							<ResultHistory
								results={book.results}
								ondelete={(result) => book.remove(result)}
								onclear={signedIn ? undefined : () => book.clear()}
								deleting={book.deleting}
								hrefFor={book.hrefFor}
							/>
							{#if !signedIn}
								<p class="account-note">
									These are kept on this device only.
									<a
										href="{resolve('/(public)/signup')}?redirectTo={encodeURIComponent(
											'/playroom/iq-test'
										)}">Keep them with an account</a
									>
								</p>
							{/if}
						{/snippet}
					</Results>
				{:else}
					<Results
						score={outcome.score}
						analysis={outcome.analysis}
						onretake={startOver}
						retakeLabel="Take the test yourself"
					/>
				{/if}
			{:else if !(mounted || dialogOpen)}
				<!-- Storage not read yet: this may be a reload resuming a run. -->
				<div class="pending" aria-busy="true"></div>
			{:else}
				<section class="intro">
					<h2>{intro.heading}</h2>
					{#each intro.body as paragraph, index (index)}
						<p>{paragraph}</p>
					{/each}
					<div class="intro-actions">
						<div class="intro-options">
							{#if offersSound}
								<wa-checkbox checked={soundOn} {@attach soundBox} data-testid="sound-on">
									Sound on
								</wa-checkbox>
							{/if}
							{#if fullscreenSupported()}
							<!--
								A box, ticked while the page is fullscreen: ticking it goes
								fullscreen, unticking leaves (see `fullscreenBox`).
							-->
								<wa-checkbox
									checked={isFullscreen()}
									{@attach fullscreenBox}
									data-testid="opens-fullscreen"
								>
									Open in full screen for maximum focus
								</wa-checkbox>
							{/if}
						</div>
						<wa-button appearance="outlined" onclick={openSettings}>Settings</wa-button>
						<wa-button variant="brand" onclick={begin}>
							{resumable && sameSettings(resumable.settings, settings) ? 'Carry on' : intro.start}
						</wa-button>
					</div>
					{#if book.results.length > 0}
						<section class="past">
							<h3>Your results</h3>
							<ResultHistory
								results={book.results}
								ondelete={(result) => book.remove(result)}
								onclear={signedIn ? undefined : () => book.clear()}
								deleting={book.deleting}
								hrefFor={book.hrefFor}
							/>
						</section>
					{/if}
				</section>
			{/if}
		</div>
	</PornLayout>

	{#if showDock}
		<MediaDock
			{hypno}
			showHypno={showHypnoControls}
			feed={porn.feed}
			showPorn={showPornControls}
			{hasSoundClips}
			onnewporn={() => porn.shuffle()}
			{showSettings}
			{settings}
			editable={stage !== 'results'}
			onsettings={changeSettings}
			onsource={switchSource}
			oncategories={(categories) => rememberHypnoCategories(settings, categories)}
		/>
	{/if}

	{#if flashes(settings) && stage === 'questions'}
		<FlashLayer images={porn.feed.images} taunts={flashTaunts} {progress} {phase} />
	{/if}

	{#if dialogOpen}
		{#key dialogKey}
			<SetupDialog
				initial={settings}
				closable={dialogClosable}
				{onstart}
				{onclose}
			/>
		{/key}
	{/if}
</div>

<style>
	/* Over the middle of the paused hypno, while its buttons are not shown:
	   the same three ways `ItemToolbar` shows them hide this. */
	.hypno-paused {
		position: absolute;
		inset: 0;
		margin: auto;
		display: grid;
		place-items: center;
		inline-size: 3.5rem;
		block-size: 3.5rem;
		border-radius: 50%;
		background: rgb(0 0 0 / 0.55);
		color: #fff;
		font-size: 1.5rem;
		pointer-events: none;
		transition: opacity 150ms ease;

		:global(.item.revealed) > &,
		:global(.item:has(.toolbar :focus-visible)) > & {
			opacity: 0;
		}

		@media (hover: hover) {
			:global(.item:hover) > & {
				opacity: 0;
			}
		}
	}

	.iq-test {
		/* So the overload backdrop, behind everything at z-index -1, still
		   paints above this wrapper's own background. */
		position: relative;
		isolation: isolate;
		min-block-size: 100svh;
		box-sizing: border-box;
		padding: 1.5rem 1rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		background: var(--iq-background);
		color: var(--wa-color-text-normal);
		font-family: var(--wa-font-family-body);
	}

	/* Room under the page for the dock, so the last of it is never hidden. */
	.iq-test.with-dock {
		padding-block-end: 5rem;
	}

	/* The porn bands run from the top of the page to its foot, a window high:
	   the padding moves into the middle column, with the footer, which stays
	   clear of the dock there (see `PornLayout`). So a question that fits
	   leaves nothing to scroll. */
	.iq-test.wide-columns,
	.iq-test.wide-columns.with-dock {
		padding-block: 0;
	}

	.brand {
		text-align: center;

		.issuer {
			font-size: 0.75rem;
			letter-spacing: 0.18em;
			text-transform: uppercase;
			color: var(--wa-color-text-quiet);
		}

		/* theme.css sets every h1 in the app's poster face and amber. */
		h1 {
			font-family: var(--wa-font-family-heading);
			font-weight: 700;
			color: var(--wa-color-text-normal);
			font-size: clamp(1.75rem, 7vw, 2.75rem);
			margin: 0.25rem 0;
		}

		.tagline {
			margin: 0;
			color: var(--wa-color-text-quiet);
		}
	}

	.sheet {
		padding: 1.5rem;
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-default);
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		box-shadow: var(--wa-shadow-m);
		align-self: stretch;
	}

	/* Holds the sheet's size for the moment before storage is read. */
	.pending {
		min-block-size: 12rem;
	}

	.intro {
		h2 {
			margin-block-start: 0;
			font-family: var(--wa-font-family-heading);
		}

		.intro-actions {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: flex-end;
			gap: 0.5rem;
		}

		/* The row's left-hand end, the buttons on the right; first in the
		   markup too, so they are reached before the start button they apply
		   to. */
		.intro-options {
			display: flex;
			flex-direction: column;
			gap: 0.375rem;
			margin-inline-end: auto;
		}

		.past {
			margin-block-start: 2rem;

			h3 {
				margin: 0 0 0.5rem;
			}
		}
	}

	.save-note {
		margin-block-end: 0.75rem;
	}

	.account-note {
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}

	footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--wa-color-text-quiet);
		text-align: center;

		.footer-links {
			display: flex;
			flex-wrap: wrap;
			justify-content: center;
			align-items: center;
			gap: 0.25rem 0.5rem;
		}

		a,
		.start-over {
			color: var(--wa-color-text-quiet);
		}

		.start-over {
			font: inherit;
			padding: 0;
			border: none;
			background: none;
			text-decoration: underline;
			cursor: pointer;
		}
	}
</style>
