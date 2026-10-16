<script lang="ts">
	import { resolve } from '$app/paths';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';

	/**
	 * Stop the scene and Ease off: always there, even while a passage is
	 * arriving, and in place of a typed safeword. Stop drops whatever was
	 * arriving and asks for a check-in, which the server insists on for a
	 * stopped scene whatever a page asks for; the banner then offers the way
	 * on. Ease off keeps going, gentler, and turns the intensity down a notch.
	 */
	let { story }: { story: DaydreamStory } = $props();
</script>

{#if story.halted && !story.busy}
	<wa-callout class="stopped" variant="warning" size="s">
		<wa-icon slot="icon" name="circle-pause" variant="solid"></wa-icon>
		<p>The scene is stopped. Carry on only if you want to.</p>
		<div class="ways">
			<wa-button size="s" appearance="outlined" onclick={() => void story.resume()}>Carry on</wa-button>
			<wa-button size="s" appearance="outlined" onclick={() => void story.easeOff()}>
				Carry on, gentler
			</wa-button>
			<wa-button size="s" appearance="plain" href={resolve('/(auth-required)/(app)/daydreams')}>
				End here
			</wa-button>
		</div>
	</wa-callout>
{/if}

<div class="controls">
	<wa-button size="s" appearance="outlined" variant="warning" onclick={() => void story.easeOff()} disabled={story.halted}>
		<wa-icon slot="start" name="gauge-simple-min" variant="solid"></wa-icon>
		Ease off
	</wa-button>
	<wa-button size="s" appearance="outlined" variant="danger" onclick={() => void story.stopScene()} disabled={story.halted}>
		<wa-icon slot="start" name="hand" variant="solid"></wa-icon>
		Stop the scene
	</wa-button>
</div>

<style>
	.stopped {
		p {
			margin: 0 0 0.5rem;
		}

		.ways {
			display: flex;
			flex-wrap: wrap;
			gap: 0.375rem;
		}
	}

	.controls {
		display: flex;
		gap: 0.375rem;
		justify-content: flex-end;
	}
</style>
