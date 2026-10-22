import { Temporal } from '@js-temporal/polyfill';
import { assertNever } from './assert-never';
import { informalWhen } from './informal-time';
import type {
	TaskMonthlyPattern,
	TaskRepeatUnit,
	TaskSchedule,
	TaskScheduleEnd,
	TaskWeekday
} from './types';

const weekdayNumbers: Record<TaskWeekday, number> = {
	mo: 1,
	tu: 2,
	we: 3,
	th: 4,
	fr: 5,
	sa: 6,
	su: 7
};

const weekdayCodes = {
	1: 'mo',
	2: 'tu',
	3: 'we',
	4: 'th',
	5: 'fr',
	6: 'sa',
	7: 'su'
} as const;

type LocalDateTime = Temporal.PlainDateTime;

function fromLocalIso(localIso: string): LocalDateTime | null {
	try {
		return Temporal.PlainDateTime.from(localIso);
	} catch {
		return null;
	}
}

function toInstantDate(localDateTime: LocalDateTime, timeZone: string): Date | null {
	try {
		return new Date(localDateTime.toZonedDateTime(timeZone).epochMilliseconds);
	} catch {
		return null;
	}
}

export function resolveTaskLocalDateTime(localIso: string, timeZone: string): Date | null {
	const localDateTime = fromLocalIso(localIso);
	if (!localDateTime) {
		return null;
	}
	return toInstantDate(localDateTime, timeZone);
}

export function taskLocalDateTimeInputValue(date: Date, timeZone: string): string {
	const zoned = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone);
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}T${pad(zoned.hour)}:${pad(zoned.minute)}`;
}

export function addTaskDuration(
	date: Date,
	every: number,
	unit: TaskRepeatUnit,
	timeZone: string
): Date {
	const zoned = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone);
	switch (unit) {
		case 'minute':
			return new Date(zoned.add({ minutes: every }).epochMilliseconds);
		case 'hour':
			return new Date(zoned.add({ hours: every }).epochMilliseconds);
		case 'day':
			return new Date(zoned.add({ days: every }).epochMilliseconds);
		case 'week':
			return new Date(zoned.add({ weeks: every }).epochMilliseconds);
		case 'month':
			return new Date(zoned.add({ months: every }).epochMilliseconds);
		case 'year':
			return new Date(zoned.add({ years: every }).epochMilliseconds);
		default:
			return assertNever(unit, 'repeat unit');
	}
}

function monthlyCandidate(
	monthStart: LocalDateTime,
	pattern: TaskMonthlyPattern | undefined,
	anchor: LocalDateTime
): LocalDateTime {
	const { daysInMonth } = Temporal.PlainYearMonth.from({
		year: monthStart.year,
		month: monthStart.month
	});

	if (!pattern || pattern.kind === 'day-of-month') {
		const day = pattern?.kind === 'day-of-month' ? pattern.day : anchor.day;
		return monthStart.with({
			day: Math.min(day, daysInMonth),
			hour: anchor.hour,
			minute: anchor.minute,
			second: 0,
			millisecond: 0,
			microsecond: 0,
			nanosecond: 0
		});
	}

	const weekday = weekdayNumbers[pattern.weekday];
	if (pattern.ordinal === -1) {
		let candidate = monthStart.with({
			day: daysInMonth,
			hour: anchor.hour,
			minute: anchor.minute,
			second: 0,
			millisecond: 0,
			microsecond: 0,
			nanosecond: 0
		});
		while (candidate.dayOfWeek !== weekday) {
			candidate = candidate.subtract({ days: 1 });
		}
		return candidate;
	}

	let candidate = monthStart.with({
		day: 1,
		hour: anchor.hour,
		minute: anchor.minute,
		second: 0,
		millisecond: 0,
		microsecond: 0,
		nanosecond: 0
	});
	while (candidate.dayOfWeek !== weekday) {
		candidate = candidate.add({ days: 1 });
	}
	return candidate.add({ weeks: pattern.ordinal - 1 });
}

function scheduleEndDate(end: TaskScheduleEnd): LocalDateTime | null {
	if (end.kind !== 'until') {
		return null;
	}
	return fromLocalIso(end.untilLocal);
}

function compareLocalDateTime(left: LocalDateTime, right: LocalDateTime): number {
	return Temporal.PlainDateTime.compare(left, right);
}

function weekStartOf(anchor: LocalDateTime): LocalDateTime {
	return anchor.subtract({ days: anchor.dayOfWeek - 1 });
}

function toOccurrenceDate(localDateTime: LocalDateTime, timeZone: string): Date | null {
	return toInstantDate(localDateTime, timeZone);
}

function* scheduledOccurrences(
	schedule: Extract<TaskSchedule, { mode: 'scheduled' }>,
	timeZone: string
): Generator<Date> {
	const anchor = fromLocalIso(schedule.anchorLocal);
	if (!anchor) {
		return;
	}

	const until = scheduleEndDate(schedule.end);
	const selectedWeekdays =
		schedule.weekdays && schedule.weekdays.length > 0
			? [...schedule.weekdays].sort((left, right) => weekdayNumbers[left] - weekdayNumbers[right])
			: [weekdayCodes[anchor.dayOfWeek as keyof typeof weekdayCodes]];

	let emitted = 0;

	for (let step = 0; step < 5000; step += 1) {
		const candidates: LocalDateTime[] = [];

		switch (schedule.frequency) {
			case 'day':
				candidates.push(anchor.add({ days: step * schedule.interval }));
				break;
			case 'week': {
				const weekStart = weekStartOf(anchor).add({ weeks: step * schedule.interval });
				for (const weekday of selectedWeekdays) {
					const candidate = weekStart.add({ days: weekdayNumbers[weekday] - 1 }).with({
						hour: anchor.hour,
						minute: anchor.minute,
						second: 0,
						millisecond: 0,
						microsecond: 0,
						nanosecond: 0
					});
					candidates.push(candidate);
				}
				break;
			}
			case 'month': {
				const monthStart = anchor
					.add({ months: step * schedule.interval })
					.with({ day: 1, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
				candidates.push(monthlyCandidate(monthStart, schedule.monthlyPattern, anchor));
				break;
			}
			case 'year':
				candidates.push(anchor.add({ years: step * schedule.interval }));
				break;
			default:
				assertNever(schedule.frequency, 'schedule frequency');
		}

		for (const candidate of candidates.sort(compareLocalDateTime)) {
			if (compareLocalDateTime(candidate, anchor) < 0) {
				continue;
			}
			if (until && compareLocalDateTime(candidate, until) > 0) {
				return;
			}
			const occurrence = toOccurrenceDate(candidate, timeZone);
			if (!occurrence) {
				continue;
			}
			emitted += 1;
			yield occurrence;
			if (schedule.end.kind === 'count' && emitted >= schedule.end.count) {
				return;
			}
		}
	}
}

export function scheduledCurrentOrNextOccurrence(
	schedule: Extract<TaskSchedule, { mode: 'scheduled' }>,
	timeZone: string,
	now: Date = new Date()
): Date | null {
	let last: Date | null = null;

	for (const occurrence of scheduledOccurrences(schedule, timeZone)) {
		if (occurrence.getTime() <= now.getTime()) {
			last = occurrence;
			continue;
		}
		return last ?? occurrence;
	}

	return last;
}

export function nextScheduledOccurrenceAfter(
	schedule: Extract<TaskSchedule, { mode: 'scheduled' }>,
	timeZone: string,
	after: Date
): Date | null {
	for (const occurrence of scheduledOccurrences(schedule, timeZone)) {
		if (occurrence.getTime() > after.getTime()) {
			return occurrence;
		}
	}
	return null;
}

export function initialNextEligibleAt(
	schedule: TaskSchedule,
	timeZone: string,
	now: Date = new Date()
): Date | null {
	if (schedule.mode !== 'scheduled') {
		return null;
	}
	return scheduledCurrentOrNextOccurrence(schedule, timeZone, now);
}

export function nextEligibleAtAfterCompletion(
	schedule: TaskSchedule,
	timeZone: string,
	completedAt: Date,
	recentCompletionTimes: Date[] = []
): Date | null {
	switch (schedule.mode) {
		case 'one-off':
			return null;
		case 'rolling-window': {
			if (!schedule.limit) {
				return null;
			}
			const allTimes = [...recentCompletionTimes, completedAt].sort(
				(left, right) => left.getTime() - right.getTime()
			);
			if (allTimes.length < schedule.limit.completions) {
				return null;
			}
			const gateSource = allTimes.at(-schedule.limit.completions);
			if (!gateSource) {
				return null;
			}
			const gate = addTaskDuration(gateSource, schedule.limit.every, schedule.limit.unit, timeZone);
			return gate.getTime() > completedAt.getTime() ? gate : null;
		}
		case 'after-completion':
			return addTaskDuration(completedAt, schedule.every, schedule.unit, timeZone);
		case 'scheduled':
			return nextScheduledOccurrenceAfter(schedule, timeZone, completedAt);
		default:
			return assertNever(schedule, 'task schedule');
	}
}

/**
 * A schedule in full, to follow the label "Repeats" in a task's detail:
 * "Anytime, up to 3 times a week", "2 days after it was last done", "Weekdays".
 * A row in a list says it shorter (`shortTaskSchedule`).
 */
export function describeTaskSchedule(schedule: TaskSchedule): string {
	switch (schedule.mode) {
		case 'one-off':
			return 'No, just once';
		case 'rolling-window': {
			if (!schedule.limit) {
				return 'Anytime, as often as you like';
			}
			const { completions, every, unit } = schedule.limit;
			return `Anytime, up to ${completions === 1 ? 'once' : `${completions} times`} ${per(every, unit)}`;
		}
		case 'after-completion':
			return `${schedule.every} ${unitNouns[schedule.unit]}${schedule.every === 1 ? '' : 's'} after it was last done`;
		case 'scheduled':
			return shortTaskSchedule(schedule);
		default:
			return assertNever(schedule, 'task schedule');
	}
}

export function scheduleReferenceDate(schedule: TaskSchedule, timeZone: string): Date | null {
	if (schedule.mode !== 'scheduled') {
		return null;
	}
	return resolveTaskLocalDateTime(schedule.anchorLocal, timeZone);
}

/**
 * How many of a task's completions still count against its rolling window's
 * limit at `now`: those whose window has not yet run out. The same test
 * `nextEligibleAtAfterCompletion` uses to decide when the task opens again.
 * Null for a task with no such limit.
 */
export function completionsInWindow(
	schedule: TaskSchedule,
	timeZone: string,
	completions: Date[],
	now: Date
): number | null {
	if (schedule.mode !== 'rolling-window' || !schedule.limit) {
		return null;
	}
	const { every, unit } = schedule.limit;
	return completions.filter(
		(completedAt) => addTaskDuration(completedAt, every, unit, timeZone).getTime() > now.getTime()
	).length;
}

/**
 * The earliest completion time that could still be in the window at `now`,
 * with a day to spare, so a query can skip everything older. Time zones and
 * month lengths shift a window's start by hours, never by a day, and the
 * exact test is `completionsInWindow`.
 */
export function windowLowerBound(schedule: TaskSchedule, now: Date): Date | null {
	if (schedule.mode !== 'rolling-window' || !schedule.limit) {
		return null;
	}
	const start = addTaskDuration(now, -schedule.limit.every, schedule.limit.unit, 'UTC');
	return new Date(start.getTime() - 24 * 60 * 60 * 1000);
}

const unitNouns: Record<TaskRepeatUnit, string> = {
	minute: 'minute',
	hour: 'hour',
	day: 'day',
	week: 'week',
	month: 'month',
	year: 'year'
};

function per(every: number, unit: TaskRepeatUnit): string {
	if (every === 1) {
		return `${unit === 'hour' ? 'an' : 'a'} ${unitNouns[unit]}`;
	}
	return `every ${every} ${unitNouns[unit]}s`;
}

const shortWeekdays: Record<TaskWeekday, string> = {
	mo: 'Mon',
	tu: 'Tue',
	we: 'Wed',
	th: 'Thu',
	fr: 'Fri',
	sa: 'Sat',
	su: 'Sun'
};

const weekdayOrder: TaskWeekday[] = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

function describeWeekdays(weekdays: TaskWeekday[]): string | null {
	const days = new Set(weekdays);
	const has = (list: TaskWeekday[]) =>
		list.length === days.size && list.every((day) => days.has(day));
	if (days.size === 0) {
		return null;
	}
	if (has(weekdayOrder)) {
		return 'Daily';
	}
	if (has(['mo', 'tu', 'we', 'th', 'fr'])) {
		return 'Weekdays';
	}
	if (has(['sa', 'su'])) {
		return 'Weekends';
	}
	return weekdayOrder
		.filter((day) => days.has(day))
		.map((day) => shortWeekdays[day])
		.join(', ');
}

/**
 * A schedule in a few words, for a task's row in a list: "3× a week",
 * "Weekdays", "2 days after the last". The whole sentence is
 * `describeTaskSchedule`, for the task's detail.
 */
export function shortTaskSchedule(schedule: TaskSchedule): string {
	switch (schedule.mode) {
		case 'one-off':
			return 'One-off';
		case 'rolling-window': {
			if (!schedule.limit) {
				return 'Anytime';
			}
			const { completions, every, unit } = schedule.limit;
			const times = completions === 1 ? 'Once' : `${completions}×`;
			return `${times} ${per(every, unit)}`;
		}
		case 'after-completion':
			return `${schedule.every} ${unitNouns[schedule.unit]}${schedule.every === 1 ? '' : 's'} after the last`;
		case 'scheduled': {
			const days =
				schedule.frequency === 'week' && schedule.weekdays
					? describeWeekdays(schedule.weekdays)
					: null;
			if (schedule.interval === 1) {
				if (days) {
					return days;
				}
				const plain = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' };
				return plain[schedule.frequency];
			}
			const every = `Every ${schedule.interval} ${schedule.frequency}s`;
			return days && days !== 'Daily' ? `${every}, ${days}` : every;
		}
		default:
			return assertNever(schedule, 'task schedule');
	}
}

/**
 * When a waiting task can next be done, said the way a to-do list says it:
 * "in 20 min", "Today 6pm", "Tomorrow 9am", "Sat 7pm", "Nov 3". Lower-case
 * with `capitalise: false`, for after a word: "Again tomorrow 9am".
 *
 * In the viewer's own time zone and locale, the time informal
 * (`$lib/informal-time`); a task that belongs to someone else's time says so
 * beside this.
 */
export function shortAvailability(
	date: Date,
	now: Date,
	timeZone: string = Temporal.Now.timeZoneId(),
	locale?: string,
	{ capitalise = true }: { capitalise?: boolean } = {}
): string {
	const minutes = Math.ceil((date.getTime() - now.getTime()) / 60_000);
	if (minutes < 60) {
		return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
			Math.max(minutes, 1),
			'minute'
		);
	}
	return informalWhen(date, now, { timeZone, locale, capitalise, timeWhenFar: false });
}
