<script lang="ts">
	import { untrack } from 'svelte';
	import type { HypnoSession } from '$lib/playroom/iq-test/hypno-session.svelte';
	import { registerAudible } from '$lib/playroom/iq-test/sound.svelte';
	import HypnoVideo from './HypnoVideo.svelte';

	/**
	 * The hypno's element: for PMVHaven a video shown among the porn
	 * (`HypnoVideo`), or for bambicloud an `<audio>` element and nothing else.
	 * What plays in it and when is the session's (`hypno-session.svelte.ts`),
	 * and the controls are the dock's.
	 *
	 * `crossorigin="anonymous"` is what lets it be routed through the page's
	 * own volume: Web Audio only takes a cross-origin element's sound when the
	 * file is fetched with CORS, and bambicloud's CDN answers that with
	 * `Access-Control-Allow-Origin: *`. Not `autoplay`: it starts from the click
	 * that starts the test, never on its own before it.
	 */
	let { session }: { session: HypnoSession } = $props();

	// Untracked: `attach` reads the session's state (what is playing), and an
	// attachment re-runs on anything it reads — which would detach and
	// re-attach the element on every new pick.
	function attach(audio: HTMLAudioElement) {
		const detach = untrack(() => session.attach(audio));
		const unregister = registerAudible(audio, 'hypno');
		return () => {
			unregister();
			detach();
		};
	}
</script>

{#if session.source === 'pmvhaven'}
	<HypnoVideo {session} />
{:else}
<!--
	`data-pause-when-silent`: at zero volume the sound module pauses it rather
	than letting it play on unheard, and resumes it when turned up.
-->
<!-- biome-ignore lint/a11y/useMediaCaption: never shown, and bambicloud has no caption track to give it; each file's written script is on its bambicloud page, which the bar links to. -->
<audio
	{@attach attach}
	crossorigin="anonymous"
	preload="auto"
	class="hypno-audio"
	data-pause-when-silent
></audio>
{/if}

<style>
	.hypno-audio {
		display: none;
	}
</style>
