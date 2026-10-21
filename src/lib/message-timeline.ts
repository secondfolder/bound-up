/**
 * How a thread's messages are laid out in time: which ones carry a timestamp,
 * and where a day begins.
 *
 * Every message used to carry its own time, so three messages sent in the
 * same minute read "10:30 PM" three times, and nothing said which day any of
 * them was. A messenger's convention is the fix: consecutive messages from
 * one side, close together, are a run, and only the last of a run shows the
 * time; a new calendar day gets a label above its first message.
 *
 * Pure and alias-free, so it is tested in the node project without a DOM.
 * Days are the viewer's local calendar days, the same clock the times are
 * formatted in.
 */

/** Messages further apart than this start a new run, even from the same side. */
export const RUN_GAP_MS = 5 * 60 * 1000;

export type TimelineMessage = { mine: boolean; createdAt: Date };

export type TimelineMark = {
	/** Whether this message's time is shown, as the last of its run. */
	showTime: boolean;
	/** Whether this message carries on a run from the one before it. */
	continuesRun: boolean;
	/** A label for the day this message starts, or null when it is not the first of its day. */
	day: string | null;
};

function sameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function startOfDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * What the day above a run of messages is called, relative to `now`.
 *
 * "Today" and "Yesterday", then the weekday for the rest of the past week,
 * then a date, with the year only when it is not this one.
 */
export function dayLabel(date: Date, now: Date, locale?: string): string {
	// Whole calendar days apart, by local midnight, so a daylight-saving
	// change (a 23- or 25-hour day) does not round into the wrong day.
	const days = Math.round((startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000));
	if (days === 0) {
		return 'Today';
	}
	if (days === 1) {
		return 'Yesterday';
	}
	if (days > 1 && days < 7) {
		return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
	}
	return new Intl.DateTimeFormat(locale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
	}).format(date);
}

/** One mark per message, in the same order, for a thread in send order. */
export function timelineMarks(
	messages: readonly TimelineMessage[],
	now: Date,
	locale?: string
): TimelineMark[] {
	return messages.map((message, index) => {
		const previous = messages[index - 1];
		const next = messages[index + 1];
		const newDay = !(previous && sameDay(previous.createdAt, message.createdAt));
		const continuesRun = !newDay && previous !== undefined && joins(previous, message);
		const endsRun = !(next && sameDay(message.createdAt, next.createdAt) && joins(message, next));
		return {
			showTime: endsRun,
			continuesRun,
			day: newDay ? dayLabel(message.createdAt, now, locale) : null
		};
	});
}

/** Whether `later` carries on the run `earlier` is in. */
function joins(earlier: TimelineMessage, later: TimelineMessage): boolean {
	return (
		earlier.mine === later.mine &&
		later.createdAt.getTime() - earlier.createdAt.getTime() <= RUN_GAP_MS
	);
}
