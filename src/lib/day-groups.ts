import { Temporal } from '@js-temporal/polyfill';
import { informalTime } from './informal-time';

/**
 * A history list split by the day things happened on, newest day first, the
 * way a to-do app shows what was done: "Today", "Yesterday", then dates. For
 * the task and reward histories (`ItemGroup`s of `ItemRow`s).
 *
 * In the viewer's own time zone and locale, which is what "today" means to
 * them. Items are expected newest first, as the histories load them, and keep
 * their order within a day.
 */
export function groupByDay<T>(
	items: T[],
	dateOf: (item: T) => Date,
	now: Date = new Date(),
	timeZone: string = Temporal.Now.timeZoneId(),
	locale?: string
): { key: string; label: string; items: T[] }[] {
	const today = dayIn(now, timeZone);
	const groups = new Map<string, { key: string; label: string; items: T[] }>();
	for (const item of items) {
		const day = dayIn(dateOf(item), timeZone);
		const key = day.toString();
		let group = groups.get(key);
		if (!group) {
			group = { key, label: dayLabel(day, today, locale), items: [] };
			groups.set(key, group);
		}
		group.items.push(item);
	}
	return [...groups.values()];
}

function dayIn(date: Date, timeZone: string): Temporal.PlainDate {
	return Temporal.Instant.fromEpochMilliseconds(date.getTime())
		.toZonedDateTimeISO(timeZone)
		.toPlainDate();
}

function dayLabel(day: Temporal.PlainDate, today: Temporal.PlainDate, locale?: string): string {
	const ago = day.until(today, { largestUnit: 'days' }).days;
	if (ago === 0) {
		return 'Today';
	}
	if (ago === 1) {
		return 'Yesterday';
	}
	return day.toLocaleString(locale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		...(day.year === today.year ? {} : { year: 'numeric' })
	});
}

/** The time of day something happened, for a row under its day: "6:40pm". */
export function timeOfDay(date: Date, locale?: string): string {
	return informalTime(date, { locale });
}
