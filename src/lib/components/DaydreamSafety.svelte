<script lang="ts">
	import type { WaSelectEvent } from '@awesome.me/webawesome/dist/events/select.js';
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';

	/**
	 * Stop the scene (labelled just Stop) and Ease off: always there, even while a passage is
	 * arriving, and in place of a typed safeword. Stop drops whatever was
	 * arriving and asks for a check-in, which the server insists on for a
	 * stopped scene whatever a page asks for; the banner then offers the way
	 * on. Ease off keeps going, gentler, and turns the intensity down a notch.
	 *
	 * Under 650px wide the two fold into a menu, so the directions keep most
	 * of the row.
	 *
	 * `children` is the rest of their row, on the left: the direction buttons,
	 * or Stop writing. It is passed in rather than placed beside this
	 * component so the stopped banner can sit above the whole row.
	 */
	let { story, children }: { story: DaydreamStory; children?: Snippet } = $props();

	function onMenu(event: WaSelectEvent) {
		// The property, not the attribute: a value Svelte sets on an upgraded
		// element is a property, which Lit does not reflect (AGENTS.md).
		switch ((event.detail.item as HTMLElement & { value?: string }).value) {
			case 'ease-off':
				void story.easeOff();
				break;
			case 'stop':
				void story.stopScene();
				break;
			default:
				break;
		}
	}
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

<div class="row">
	<div class="lead">{@render children?.()}</div>
	<div class="controls">
		<wa-button size="s" appearance="outlined" variant="warning" onclick={() => void story.easeOff()} disabled={story.halted}>
			Ease off
		</wa-button>
		<wa-button size="s" appearance="outlined" variant="danger" onclick={() => void story.stopScene()} disabled={story.halted}>
			Stop
		</wa-button>
	</div>
	<!-- The same two, folded into a menu on a narrow screen so the directions
	     keep the row. Both are always rendered and CSS picks one, so nothing
	     shifts as the page hydrates. -->
	<wa-dropdown class="menu" placement="top-end" onwa-select={onMenu}>
		<wa-button slot="trigger" size="s" appearance="plain" pill>
			<wa-icon name="ellipsis-vertical" variant="solid" label="Ease off or stop"></wa-icon>
		</wa-button>
		<wa-dropdown-item value="ease-off" disabled={story.halted}>Ease off</wa-dropdown-item>
		<wa-dropdown-item value="stop" variant="danger" disabled={story.halted}>Stop</wa-dropdown-item>
	</wa-dropdown>
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

	/* Wider than the gap inside either group, so the directions and the
	   safety controls read as two sets rather than one run of buttons. */
	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	/* `min-inline-size: 0` lets the directions shrink and scroll instead of
	   pushing the controls off the row. */
	.lead {
		flex: 1 1 auto;
		min-inline-size: 0;
	}

	.controls {
		flex: none;
		display: flex;
		gap: 0.375rem;
	}

	.menu {
		flex: none;
		display: none;
	}

	@media (width < 650px) {
		/* The menu button is plain, with no edge of its own to keep apart from
		   the directions, so the gap that separates the outlined buttons is
		   just empty space here. */
		.row {
			gap: 0;
		}

		.controls {
			display: none;
		}

		.menu {
			display: block;
		}
	}
</style>
