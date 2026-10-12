<script lang="ts">
	import { dockLayouts, showsEverything, type TabLayout } from '$lib/playroom/iq-test/dock';
	import {
		fullscreenSupported,
		isFullscreen,
		toggleFullscreen
	} from '$lib/playroom/iq-test/fullscreen.svelte';
	import { formatDuration, type HypnoCategory, type HypnoSource } from '$lib/playroom/iq-test/hypno';
	import type { HypnoSession } from '$lib/playroom/iq-test/hypno-session.svelte';
	import type { MediaFeed } from '$lib/playroom/iq-test/media';
	import { soundMuted, soundVolume, toggleMuted } from '$lib/playroom/iq-test/sound.svelte';
	import HypnoBrowser from './HypnoBrowser.svelte';
	import IntensitySlider from './IntensitySlider.svelte';
	import MediaTab from './MediaTab.svelte';
	import SettingsFields, { type SettingsChoice } from './SettingsFields.svelte';
	import SpiralIcon from './SpiralIcon.svelte';

	/**
	 * The media dock, fixed to the foot of the page: a tab each for the hypno
	 * and the porn, and one for settings. A tab expanded becomes its own
	 * panel, centred over the dock on top of the others; one at a time, and a
	 * click anywhere outside it puts it away.
	 *
	 * How much each tab shows depends on the dock's width (see dock.ts). The
	 * same with a panel open as without: the panel floats over the dock rather
	 * than taking room from the other tabs, so they stay as they were
	 * underneath it.
	 */
	let {
		hypno,
		showHypno,
		feed,
		showPorn,
		hasSoundClips,
		onnewporn,
		showSettings,
		settings,
		editable,
		onsettings,
		onsource,
		oncategories
	}: {
		hypno: HypnoSession | null;
		/** Whether the hypno's tab is shown: once it has started, so it can always be stopped. */
		showHypno: boolean;
		feed: MediaFeed;
		showPorn: boolean;
		/** Whether any clip has sound the volume can reach, and so the porn tab a volume. */
		hasSoundClips: boolean;
		onnewporn: () => void;
		showSettings: boolean;
		settings: SettingsChoice;
		/**
		 * Whether the settings can be changed: during the questions. On the
		 * results the tab is only the way out of fullscreen.
		 */
		editable: boolean;
		onsettings: (choice: SettingsChoice) => void;
		/** Bambi's hypno switched between its two sources. */
		onsource: (source: HypnoSource) => void;
		/** The hypno categories chosen in its browser, to remember. */
		oncategories: (categories: HypnoCategory[]) => void;
	} = $props();

	const SOURCE_OPTIONS: readonly { id: HypnoSource; label: string }[] = [
		{ id: 'bambicloud', label: 'Bambi Cloud (audio)' },
		{ id: 'pmvhaven', label: 'PMVHaven (video)' }
	];

	type DockTab = 'hypno' | 'porn' | 'settings';
	/** Which tab is expanded into its panel, if any. */
	let open = $state<DockTab | null>(null);
	const tabs = $state<Record<DockTab, HTMLElement | undefined>>({
		hypno: undefined,
		porn: undefined,
		settings: undefined
	});

	function toggle(tab: DockTab) {
		open = open === tab ? null : tab;
	}

	/**
	 * A click anywhere outside the open panel puts it away. On `pointerdown`,
	 * so that a click on the other tab's button closes this panel first and
	 * then opens that one. Not for a click in a dialog, which sits on top of
	 * everything and is not "outside" in any sense the taker would mean.
	 */
	$effect(() => {
		const tab = open === null ? undefined : tabs[open];
		if (!tab) {
			return;
		}
		const onPointerDown = (event: PointerEvent) => {
			const path = event.composedPath();
			if (path.includes(tab)) {
				return;
			}
			if (path.some((node) => node instanceof Element && node.localName === 'wa-dialog')) {
				return;
			}
			open = null;
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		return () => document.removeEventListener('pointerdown', onPointerDown, true);
	});

	/** Whether the hypno panel's list of hypnos to choose from is showing: put away for a new hypno. */
	let choosing = $state(false);
	$effect.pre(() => {
		void hypno;
		choosing = false;
	});

	const hypnoTitle = $derived.by(() => {
		if (hypno?.current) {
			return hypno.current.name;
		}
		return hypno?.status === 'unavailable' ? 'No hypno available' : 'Finding a hypno…';
	});
	/** Whether the hypno is heard: muted, or at zero, it is paused. */
	const hypnoPlaying = $derived(!soundMuted('hypno') && soundVolume('hypno') > 0);

	/**
	 * The dock's width, measured, and so how much each tab shows: a tab is as
	 * wide as its contents, so it cannot measure the room it is allowed itself
	 * (see dock.ts).
	 */
	let width = $state(0);
	const liveLayouts = $derived(
		dockLayouts(width, (showHypno && hypno ? 1 : 0) + (showPorn ? 1 : 0), showSettings, editable)
	);

	/**
	 * Dragging the intensity slider in the settings tab's bar changes the
	 * level as it goes, which can bring the hypno and porn tabs in or take
	 * them out — and the tabs are centred, so the settings tab, and the
	 * slider under the pointer, would jump sideways mid-drag. So while it is
	 * dragged the tab is held where it was (a `translate` making up the
	 * difference, every frame) and the tabs' layouts are held too, so the
	 * slider cannot be taken away for want of room. Let go, the layouts catch
	 * up and the tab glides to its place.
	 */
	let heldLayouts = $state<ReturnType<typeof dockLayouts> | null>(null);
	const layouts = $derived(heldLayouts ?? liveLayouts);
	const mediaLayout: TabLayout = $derived(layouts.media);

	let holding: { tab: HTMLElement; at: number; frame: number } | null = null;

	/** How far a tab is from where it was when the drag began. */
	function drift(tab: HTMLElement, at: number): number {
		const shift = Number.parseFloat(tab.style.translate) || 0;
		return at - (tab.getBoundingClientRect().left - shift);
	}

	function hold() {
		const tab = tabs.settings;
		if (!tab || holding) {
			return;
		}
		heldLayouts = liveLayouts;
		const held = { tab, at: tab.getBoundingClientRect().left, frame: 0 };
		const step = () => {
			tab.style.translate = `${drift(tab, held.at)}px`;
			held.frame = requestAnimationFrame(step);
		};
		held.frame = requestAnimationFrame(step);
		holding = held;
	}

	function release() {
		const held = holding;
		holding = null;
		heldLayouts = null;
		if (!held) {
			return;
		}
		cancelAnimationFrame(held.frame);
		// Once the layouts have caught up: from where it is held to its place.
		requestAnimationFrame(() => {
			const from = drift(held.tab, held.at);
			held.tab.style.translate = '';
			if (Math.abs(from) > 0.5 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
				held.tab.animate([{ translate: `${from}px` }, { translate: '0px' }], {
					duration: 220,
					easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)'
				});
			}
		});
	}

	$effect(() => release);

	/** "1 clip", "3 clips". */
	function counted(count: number, noun: string): string {
		return `${count} ${noun}${count === 1 ? '' : 's'}`;
	}
</script>

<div class="dock" data-testid="media-dock">
	<div class="dock-tabs" bind:clientWidth={width}>
		{#if hypno && showHypno}
			<MediaTab
				bind:element={tabs.hypno}
				name="Hypno"
				layout={mediaLayout}
				title={hypnoTitle}
				titleHref={hypno.current?.pageUrl ?? null}
				byline={hypno.current?.author ? `by ${hypno.current.author}` : null}
				shortTitle="Hypno"
				detail={hypno.durationMs > 0
					? `${formatDuration(hypno.positionMs)} / ${formatDuration(hypno.durationMs)}`
					: null}
				shortDetail={hypno.remainingMs > 0 ? `${formatDuration(hypno.remainingMs)} left` : null}
				channel="hypno"
				action={{
					label: 'Next',
					icon: 'forward-step',
					onclick: () => void hypno?.next()
				}}
				expanded={open === 'hypno'}
				panelId="hypno-panel"
				ontoggle={() => toggle('hypno')}
				testid="hypno-tab"
			>
				{#snippet iconSnippet()}
					<SpiralIcon />
				{/snippet}
				{#snippet headerExtra()}
					<!-- The same as the mute toggle, said as what it does to the track. -->
					<wa-button size="s" appearance="outlined" onclick={() => toggleMuted('hypno')}>
						<wa-icon slot="start" name={hypnoPlaying ? 'pause' : 'play'} variant="solid"></wa-icon>
						{hypnoPlaying ? 'Pause' : 'Play'}
					</wa-button>
					<!--
						A native button: it is a disclosure trigger, and its state is
						`aria-expanded`, which wa-button does not forward.
					-->
					<button
						type="button"
						class="choose-hypno"
						aria-expanded={choosing}
						aria-controls="hypno-choices"
						onclick={() => {
							choosing = !choosing;
						}}
					>
						<wa-icon name={choosing ? 'chevron-up' : 'list'} variant="solid"></wa-icon>
						Select
					</button>
				{/snippet}
				{#if settings.vibe === 'bambi'}
					<!-- Bambi has two sources; every other vibe has only PMVHaven. -->
					<fieldset class="hypno-source">
						<legend>Hypnos from</legend>
						{#each SOURCE_OPTIONS as option (option.id)}
							<label class:on={hypno.source === option.id}>
								<input
									type="radio"
									name="hypno-source"
									value={option.id}
									checked={hypno.source === option.id}
									onchange={() => onsource(option.id)}
								/>
								{option.label}
							</label>
						{/each}
					</fieldset>
				{/if}
				{#if choosing}
					<div id="hypno-choices" class="hypno-choices">
						<HypnoBrowser session={hypno} {oncategories} />
					</div>
				{/if}
			</MediaTab>
		{/if}
		{#if showPorn}
			<MediaTab
				bind:element={tabs.porn}
				name="Porn"
				glyph="XXX"
				layout={mediaLayout}
				title="Porn"
				detail={`${counted(feed.images.length, 'picture')} · ${counted(feed.clips.length, 'clip')}`}
				shortDetail={counted(feed.images.length + feed.clips.length, 'item')}
				channel={hasSoundClips ? 'clips' : null}
				action={{ label: 'New porn', icon: 'shuffle', onclick: onnewporn }}
				more={!showsEverything(mediaLayout, hasSoundClips)}
				expanded={open === 'porn'}
				panelId="porn-panel"
				ontoggle={() => toggle('porn')}
				testid="porn-tab"
			/>
		{/if}
		{#if showSettings}
			<MediaTab
				bind:element={tabs.settings}
				name="Settings"
				icon="gear"
				layout={layouts.settings}
				title="Settings"
				action={fullscreenSupported()
					? {
							label: isFullscreen() ? 'Exit fullscreen' : 'Fullscreen',
							icon: isFullscreen() ? 'compress' : 'expand',
							onclick: toggleFullscreen
						}
					: null}
				more={editable}
				expanded={open === 'settings'}
				panelId="settings-panel"
				ontoggle={() => toggle('settings')}
				testid="settings-tab"
				scrollAnchor="bottom"
				actionInHead
			>
				{#snippet barExtra()}
					{#if editable}
						<IntensitySlider
							compact
							value={settings.intensity}
							onchange={(intensity) => onsettings({ ...settings, intensity })}
							ondrag={(dragging) => (dragging ? hold() : release())}
						/>
					{/if}
				{/snippet}
				{#if editable}
					<SettingsFields value={settings} onchange={onsettings} sliderLast />
				{/if}
			</MediaTab>
		{/if}
	</div>
</div>

<style>
	/*
	 * Fixed to the foot of the window, above the flashes, with the page given
	 * room underneath (the page's `with-dock`) so the last of it is never
	 * hidden.
	 */
	.dock {
		position: fixed;
		inset-inline: 0;
		inset-block-end: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
		padding-inline: 0.5rem;
		pointer-events: none;

		> * {
			pointer-events: auto;
		}
	}

	/* The full width of the dock, so it can be measured; the tabs inside are
	   as wide as their contents, centred. Positioned for an expanded tab's
	   panel, which is centred over the whole of it. */
	.dock-tabs {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.hypno-source {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		border: none;
		font-size: 0.875rem;

		legend {
			float: inline-start;
			margin-inline-end: 0.25rem;
			padding: 0;
			color: var(--wa-color-text-quiet);
		}

		label {
			display: inline-flex;
			align-items: center;
			gap: 0.375rem;
			padding: 0.25rem 0.75rem;
			border: var(--wa-border-width-s) solid var(--wa-color-neutral-border-normal);
			border-radius: 999px;
			cursor: pointer;

			&.on {
				border-color: var(--wa-color-brand-border-loud);
				background: var(--wa-color-brand-fill-quiet);
			}

			&:has(input:focus-visible) {
				outline: var(--wa-focus-ring);
				outline-offset: var(--wa-focus-ring-offset);
			}
		}

		input {
			accent-color: var(--wa-color-brand-fill-loud);
		}
	}

	.choose-hypno {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		block-size: var(--wa-form-control-height-s, 2rem);
		padding-inline: 0.75rem;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		border: var(--wa-border-width-s) solid var(--wa-color-neutral-border-normal);
		border-radius: var(--wa-border-radius-m);
		background: none;
		color: var(--wa-color-text-normal);
		cursor: pointer;

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}
</style>
