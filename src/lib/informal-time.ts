/**
 * Times the way people say them: "9am", "6:30pm", "Tomorrow 9am". For lists
 * and anything else read at a glance, where "9:00 AM" is twice the width for
 * nothing. Alias-free and pure, so it is tested in node.
 *
 * Built on `Intl.DateTimeFormat#formatToParts`, so each locale keeps its own
 * order and its own 12- or 24-hour habit — a 24-hour locale still gets
 * "21:00", only without anything it would not write anyway — and
 * `Intl.RelativeTimeFormat` for "today" and "tomorrow" in the reader's words.
 */

import { Temporal } from '@js-temporal/polyfill';

type Options = { timeZone?: string; locale?: string };

/**
 * A time of day: "9am", "9:30am", "21:00". The minutes go when they are
 * ":00"; a 12-hour day period is lower-cased and pulled up against the number.
 */
export function informalTime(date: Date, { timeZone, locale }: Options = {}): string {
	const format = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone });
	const parts = format.formatToParts(date);
	const twelveHour = parts.some((part) => part.type === 'dayPeriod');
	if (!twelveHour) {
		return format.format(date);
	}
	const onTheHour = parts.find((part) => part.type === 'minute')?.value === '00';
	const kept = parts.filter((part, index) => {
		const next = parts[index + 1];
		if (onTheHour && (part.type === 'minute' || next?.type === 'minute')) {
			return false;
		}
		// The space between "9" and "pm", where the period follows the time.
		return !(part.type === 'literal' && next?.type === 'dayPeriod' && index > 0);
	});
	return kept
		.map((part) =>
			part.type === 'dayPeriod'
				? part.value.toLocaleLowerCase(locale).replaceAll('.', '')
				: part.value
		)
		.join('')
		.trim();
}

/** A day near `now`, in words: "today", "tomorrow", "yesterday", else null. */
export function nearDay(days: number, locale?: string): string | null {
	if (Math.abs(days) > 1) {
		return null;
	}
	return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
}

/** Capitalises the first letter, for a phrase that starts a line. */
export function sentenceCase(text: string, locale?: string): string {
	return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** A calendar date in a time zone, for counting the days between two instants there. */
function dayIn(date: Date, timeZone: string): Temporal.PlainDate {
	return Temporal.Instant.fromEpochMilliseconds(date.getTime())
		.toZonedDateTimeISO(timeZone)
		.toPlainDate();
}

/**
 * A moment near or not so near `now`, forwards or back: "Today 6pm",
 * "Tomorrow 9am", "Yesterday 6:40pm", "Sat 7pm" (within a week either way),
 * "Nov 3, 9am" beyond that, with the year only when it is not this one.
 *
 * `capitalise: false` for after a word ("Again tomorrow 9am"); `timeWhenFar:
 * false` drops the time from a date more than a week off, where it is rarely
 * what the reader is after.
 */
export function informalWhen(
	date: Date,
	now: Date,
	{
		timeZone = Temporal.Now.timeZoneId(),
		locale,
		capitalise = true,
		timeWhenFar = true
	}: Options & { capitalise?: boolean; timeWhenFar?: boolean } = {}
): string {
	const { days } = dayIn(now, timeZone).until(dayIn(date, timeZone), { largestUnit: 'days' });
	const time = informalTime(date, { timeZone, locale });
	const near = nearDay(days, locale);
	if (near) {
		return `${capitalise ? sentenceCase(near, locale) : near} ${time}`;
	}
	if (Math.abs(days) < 7) {
		const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(date);
		return `${weekday} ${time}`;
	}
	const sameYear = dayIn(now, timeZone).year === dayIn(date, timeZone).year;
	const day = new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' }),
		timeZone
	}).format(date);
	return timeWhenFar ? `${day}, ${time}` : day;
}
