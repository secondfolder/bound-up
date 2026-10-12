<script lang="ts">
	/**
	 * A clip's progress, along the foot of its buttons, that can be dragged to
	 * scrub. It finds the video being shown in its item (`ClipPlayer` keeps the
	 * next one loading out of sight, marked `pending`), and follows it through
	 * `timeupdate` and `loadedmetadata`, which do not bubble, so they are
	 * caught on the way down. A native range input, so it is a slider to the
	 * keyboard and a screen reader as well.
	 */
	let { name }: { name: string } = $props();

	let position = $state(0);
	let duration = $state(0);
	let video: HTMLVideoElement | null = null;

	function follows(node: HTMLElement) {
		const item = node.closest('.item');
		if (!item) {
			return;
		}
		const shown = () => item.querySelector<HTMLVideoElement>('video:not(.pending)');
		const update = () => {
			video = shown();
			duration = video && Number.isFinite(video.duration) ? video.duration : 0;
			position = video?.currentTime ?? 0;
		};
		update();
		item.addEventListener('timeupdate', update, true);
		item.addEventListener('loadedmetadata', update, true);
		item.addEventListener('durationchange', update, true);
		return () => {
			item.removeEventListener('timeupdate', update, true);
			item.removeEventListener('loadedmetadata', update, true);
			item.removeEventListener('durationchange', update, true);
		};
	}

	function seek(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const at = Number(target.value);
		position = at;
		if (video) {
			video.currentTime = at;
		}
	}

	const label = (seconds: number) =>
		`${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
</script>

<input
	{@attach follows}
	class="scrub"
	type="range"
	min="0"
	max={duration || 1}
	step="0.1"
	value={position}
	disabled={duration === 0}
	aria-label="Position in the {name}"
	aria-valuetext="{label(position)} of {label(duration)}"
	style:--filled="{duration > 0 ? (position / duration) * 100 : 0}%"
	oninput={seek}
/>

<style>
	/* A thin bar, thicker under the pointer, filled in the brand colour up to
	   where the clip has got to; its thumb shows only while it is held or
	   pointed at. */
	.scrub {
		appearance: none;
		inline-size: 100%;
		block-size: 1rem;
		margin: 0;
		background: transparent;
		cursor: pointer;

		&::-webkit-slider-runnable-track {
			block-size: 4px;
			border-radius: 2px;
			background: linear-gradient(
				to right,
				var(--wa-color-brand-fill-loud) var(--filled),
				rgb(255 255 255 / 0.35) var(--filled)
			);
			transition: block-size 120ms ease;
		}

		&::-moz-range-track {
			block-size: 4px;
			border-radius: 2px;
			background: linear-gradient(
				to right,
				var(--wa-color-brand-fill-loud) var(--filled),
				rgb(255 255 255 / 0.35) var(--filled)
			);
		}

		&::-webkit-slider-thumb {
			appearance: none;
			inline-size: 0.75rem;
			block-size: 0.75rem;
			margin-block-start: calc((4px - 0.75rem) / 2);
			border-radius: 50%;
			background: #fff;
			opacity: 0;
			transition: opacity 120ms ease;
		}

		&::-moz-range-thumb {
			inline-size: 0.75rem;
			block-size: 0.75rem;
			border: none;
			border-radius: 50%;
			background: #fff;
			opacity: 0;
		}

		&:hover::-webkit-slider-thumb,
		&:focus-visible::-webkit-slider-thumb,
		&:active::-webkit-slider-thumb {
			opacity: 1;
		}

		&:hover::-moz-range-thumb,
		&:focus-visible::-moz-range-thumb {
			opacity: 1;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: 2px;
		}

		&:disabled {
			cursor: default;
		}
	}
</style>
