<script lang="ts">
	import { informalTime } from '$lib/informal-time';
	import { calendarDayKey, describeTimeZoneDifference, humanizeTimeZone } from '$lib/timezone';

	/**
	 * "Jun's time", for a time that belongs to someone in another time zone,
	 * with the detail a tap or a hover away: their zone, what time it is for
	 * them and for the viewer right now, and how far apart they are.
	 *
	 * Says whose time it is rather than where ("Anchorage time"): the person is
	 * what the reader knows, and the city is in the tooltip for whoever wants
	 * it. A real button, so a tap focuses it and the tooltip shows on a phone
	 * as it does on hover.
	 */
	let {
		name,
		timeZone,
		viewerTimeZone
	}: {
		/** Whose time it is, as the viewer knows them: "Jun". */
		name: string;
		timeZone: string;
		viewerTimeZone: string;
	} = $props();

	const id = $props.id();

	/** Read when the tooltip opens, so "now" is now and not when the page loaded. */
	let now = $state(new Date());

	/** Two zones can be different places on the same clock. */
	const apart = $derived.by(() => {
		const difference = describeTimeZoneDifference(timeZone, viewerTimeZone, now);
		return difference === 'same time'
			? 'Your clocks show the same time right now.'
			: `${name} is ${difference}.`;
	});

	/** A time, with its weekday when the two of them are on different days. */
	function timeIn(zone: string): string {
		const time = informalTime(now, { timeZone: zone });
		if (calendarDayKey(timeZone, now) === calendarDayKey(viewerTimeZone, now)) {
			return time;
		}
		const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: zone }).format(
			now
		);
		return `${weekday} ${time}`;
	}
</script>

<!--
	Labelled by its own words first: `wa-tooltip` appends itself to its
	anchor's `aria-labelledby`, which on a button with no label of its own
	replaced "Jun's time" with the tooltip's text. This way a screen reader
	hears both, the detail the tooltip gives everyone else included.
-->
<button
	type="button"
	class="whose-time"
	id={`whose-time-${id}`}
	aria-labelledby={`whose-time-label-${id}`}
>
	<wa-icon name="globe" variant="solid"></wa-icon>
	<span id={`whose-time-label-${id}`}>{name}'s time</span>
</button>
<wa-tooltip
	for={`whose-time-${id}`}
	trigger="hover focus"
	onwa-show={() => {
		now = new Date();
	}}
>
	<span class="zone">{humanizeTimeZone(timeZone)} time ({timeZone})</span>
	<span>It's {timeIn(timeZone)} for {name}, {timeIn(viewerTimeZone)} for you.</span>
	<span>{apart}</span>
</wa-tooltip>

<style>
	.whose-time {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		/* Reset from Web Awesome's native-button look (see ItemRow's `.open`). */
		block-size: auto;
		margin: 0;
		transform: none;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		text-decoration: underline dotted;
		text-underline-offset: 0.2em;
		cursor: help;

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
			border-radius: var(--wa-border-radius-s);
		}
	}

	wa-tooltip {
		--max-width: 18rem;

		& span {
			display: block;
		}
	}

	.zone {
		font-weight: var(--wa-font-weight-semibold, 600);
	}
</style>
