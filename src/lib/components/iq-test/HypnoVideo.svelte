<script lang="ts">
	import { untrack } from 'svelte';
	import type { HypnoSession } from '$lib/playroom/iq-test/hypno-session.svelte';
	import { provideHypnoVideo } from '$lib/playroom/iq-test/hypno-video-host';
	import { registerDirect } from '$lib/playroom/iq-test/sound.svelte';

	/**
	 * A PMVHaven hypno's video. It is shown as one of the porn videos, at the
	 * top of the first column (see `hypno-video-host.ts`, which moves it
	 * there), and kept out of sight here, playing on for its sound, wherever
	 * there are no columns. What plays in it is the session's, as for the
	 * bambicloud `<audio>` in `HypnoPlayer`.
	 *
	 * No `crossorigin`: PMVHaven's bucket sends no CORS header, so asking for
	 * CORS would refuse the file altogether. That also keeps it out of Web
	 * Audio (whose output would be silence), so the hypno's volume reaches it
	 * through the element's own `volume` instead (`registerDirect`).
	 */
	let { session }: { session: HypnoSession } = $props();

	// Untracked for the same reason as the audio: `attach` reads the session's
	// state, and an attachment re-runs on whatever it reads.
	function attach(video: HTMLVideoElement) {
		const detach = untrack(() => session.attach(video));
		const unregister = registerDirect(video, 'hypno');
		// Its parent is its home: read now, while it is still there, rather than
		// through a `bind:this`, which is not guaranteed to be set first.
		const home = video.parentElement;
		const unprovide = home ? provideHypnoVideo(video, home) : () => undefined;
		return () => {
			unprovide();
			unregister();
			detach();
		};
	}
</script>

<div class="home">
	<!--
		`data-pause-when-silent`: at zero volume the sound module pauses it, as it
		does the audio. Decorative to a screen reader: the hypno tab names what
		is playing, and the column's enlarge button names it as the hypno.
	-->
	<!-- biome-ignore lint/a11y/useMediaCaption: a third party's music video, which comes with no caption track; its page is linked from the hypno panel. -->
	<video
		{@attach attach}
		preload="auto"
		playsinline
		disablepictureinpicture
		class="hypno-video"
		data-pause-when-silent
		data-testid="hypno-video"
		aria-hidden="true"
		tabindex="-1"
	></video>
</div>

<style>
	/* Out of sight but still playing, for its sound. */
	.home {
		position: fixed;
		inset-block-end: 0;
		inset-inline-end: 0;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		opacity: 0;
		pointer-events: none;
	}

	/* Scoped to the element itself, so it keeps these in a column too. */
	.hypno-video {
		display: block;
		inline-size: 100%;
		border-radius: var(--wa-border-radius-m);
		background: #000;
	}
</style>
