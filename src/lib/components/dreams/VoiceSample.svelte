<script lang="ts" module>
	/** Each voice's sample once fetched, as a URL to play it from, for as long as the page is open. */
	const fetched = new Map<string, string>();
	/** The sample playing, on any button: starting another stops it. */
	let playing: { stop: () => void } | null = null;
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { reportRequestFailure, tryFetch } from '$lib/request-failure.svelte';

	/**
	 * Plays a voice saying one sample line, to hear it before choosing it
	 * (docs/dreams.md, "Voices"): a voice preset, or this daydream's narrator.
	 * Again stops it. One plays at a time across every button on the page.
	 * Inside a voice menu's items too, so voices can be tried one after
	 * another without the menu closing each time.
	 */
	let {
		voice,
		label
	}: {
		voice: string;
		/** What the button is called while it would play: "Hear Breathy", "Hear Ottilie’s voice". */
		label: string;
	} = $props();

	let status = $state<'idle' | 'loading' | 'playing'>('idle');

	async function source(): Promise<string | null> {
		const kept = fetched.get(voice);
		if (kept) {
			return kept;
		}
		const response = await tryFetch('/api/dreams/voice-sample', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ voice })
		});
		if (!response?.ok) {
			const said: unknown = await response?.json().catch(() => null);
			const message =
				typeof said === 'object' &&
				said !== null &&
				'message' in said &&
				typeof said.message === 'string'
					? said.message
					: undefined;
			reportRequestFailure(response, message);
			return null;
		}
		const url = URL.createObjectURL(await response.blob());
		fetched.set(voice, url);
		return url;
	}

	async function toggle() {
		if (status !== 'idle') {
			playing?.stop();
			return;
		}
		playing?.stop();
		status = 'loading';
		const url = await source();
		if (!url) {
			status = 'idle';
			return;
		}
		const audio = new Audio(url);
		const mine = {
			stop: () => {
				audio.pause();
				status = 'idle';
				if (playing === mine) {
					playing = null;
				}
			}
		};
		playing = mine;
		audio.addEventListener('ended', mine.stop);
		try {
			await audio.play();
			status = 'playing';
		} catch {
			mine.stop();
		}
	}

	/**
	 * The click goes no further than the button: inside a `wa-dropdown-item`,
	 * the menu would take it as choosing that voice and close. Svelte's
	 * delegated `onclick` runs at the root, after the menu has seen it, so the
	 * listener is the button's own.
	 */
	const press: Attachment<HTMLElement> = (element) => {
		const onClick = (event: Event) => {
			event.stopPropagation();
			void toggle();
		};
		element.addEventListener('click', onClick);
		return () => element.removeEventListener('click', onClick);
	};
</script>

<wa-button class="voice-sample" size="s" appearance="plain" pill {@attach press}>
	{#if status === 'loading'}
		<wa-spinner aria-label="Getting the voice ready"></wa-spinner>
	{:else if status === 'playing'}
		<wa-icon name="stop" variant="solid" label="Stop the voice"></wa-icon>
	{:else}
		<wa-icon name="play" variant="solid" {label}></wa-icon>
	{/if}
</wa-button>

<style>
	.voice-sample {
		flex: none;
	}
</style>
