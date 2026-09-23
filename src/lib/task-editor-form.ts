import type { z } from 'zod';
import { assertNever } from './assert-never';
import type { TaskEditorFormSchema } from './schemas/taskEditorForm';
import type { TaskInput } from './tasks';
import type {
	PartnershipTaskView,
	SelfTaskView,
	TaskMonthlyPattern,
	TaskSchedule,
	TaskScheduleEnd
} from './types';

// `z.output` rather than superforms' `Infer<>`, which is the same type for a
// Zod schema: Biome 2.5's type inference recurses on `Infer<>` until it
// overflows its stack, crashing the whole lint run rather than one rule.
export type TaskEditorFormValues = z.output<TaskEditorFormSchema>;

type TaskEditableView = SelfTaskView | PartnershipTaskView;

const LINE_BREAK = /\r?\n/;

function parseScheduledOrdinal(
	value: TaskEditorFormValues['scheduledOrdinal']
): 1 | 2 | 3 | 4 | -1 {
	switch (value) {
		case '-1':
			return -1;
		case '1':
			return 1;
		case '2':
			return 2;
		case '3':
			return 3;
		case '4':
			return 4;
		default:
			return assertNever(value, 'ordinal');
	}
}

function parseCompletionMessages(text: string | undefined): string[] {
	return (text ?? '')
		.split(LINE_BREAK)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

function defaultValues(timezoneOwnerUserId: string): TaskEditorFormValues {
	return {
		title: '',
		description: '',
		creditsAwarded: '0',
		active: true,
		completionMessagesText: '',
		timezoneOwnerUserId,
		scheduleMode: 'one-off',
		rollingLimitEnabled: false,
		rollingLimitCompletions: '1',
		rollingLimitEvery: '1',
		rollingLimitUnit: 'day',
		afterEvery: '1',
		afterUnit: 'day',
		scheduledAnchorLocal: '',
		scheduledFrequency: 'week',
		scheduledInterval: '1',
		scheduledWeekdays: [],
		scheduledMonthlyPatternKind: 'day-of-month',
		scheduledDayOfMonth: '1',
		scheduledOrdinal: '1',
		scheduledWeekday: 'mo',
		scheduledEndKind: 'never',
		scheduledUntilLocal: '',
		scheduledCount: '1'
	};
}

export function taskEditorFormValuesForCreate(timezoneOwnerUserId: string): TaskEditorFormValues {
	return defaultValues(timezoneOwnerUserId);
}

export function taskEditorFormValuesFromTask(task: TaskEditableView): TaskEditorFormValues {
	const values = defaultValues(task.timezoneOwnerUserId);
	values.title = task.title;
	values.description = task.description ?? '';
	values.creditsAwarded = String(task.creditsAwarded);
	values.active = task.active;
	values.completionMessagesText = task.completionMessages.join('\n');
	values.scheduleMode = task.schedule.mode;

	switch (task.schedule.mode) {
		case 'one-off':
			// Nothing beyond the mode itself, which is already set above.
			break;
		case 'rolling-window':
			values.rollingLimitEnabled = task.schedule.limit !== null;
			values.rollingLimitCompletions = String(task.schedule.limit?.completions ?? 1);
			values.rollingLimitEvery = String(task.schedule.limit?.every ?? 1);
			values.rollingLimitUnit = task.schedule.limit?.unit ?? 'day';
			break;
		case 'after-completion':
			values.afterEvery = String(task.schedule.every);
			values.afterUnit = task.schedule.unit;
			break;
		case 'scheduled': {
			values.scheduledAnchorLocal = task.schedule.anchorLocal;
			values.scheduledFrequency = task.schedule.frequency;
			values.scheduledInterval = String(task.schedule.interval);
			values.scheduledWeekdays = task.schedule.weekdays ?? [];
			values.scheduledMonthlyPatternKind = task.schedule.monthlyPattern?.kind ?? 'day-of-month';
			values.scheduledDayOfMonth = String(
				task.schedule.monthlyPattern?.kind === 'day-of-month'
					? task.schedule.monthlyPattern.day
					: Number(task.schedule.anchorLocal.slice(8, 10))
			);
			const ordinal =
				task.schedule.monthlyPattern?.kind === 'nth-weekday'
					? task.schedule.monthlyPattern.ordinal
					: 1;
			values.scheduledOrdinal = `${ordinal}` as const;
			values.scheduledWeekday =
				task.schedule.monthlyPattern?.kind === 'nth-weekday'
					? task.schedule.monthlyPattern.weekday
					: 'mo';
			values.scheduledEndKind = task.schedule.end.kind;
			values.scheduledUntilLocal =
				task.schedule.end.kind === 'until' ? task.schedule.end.untilLocal : '';
			values.scheduledCount =
				task.schedule.end.kind === 'count' ? String(task.schedule.end.count) : '1';
			break;
		}
		default:
			assertNever(task.schedule, 'task schedule');
	}

	return values;
}

function scheduleFromValues(values: TaskEditorFormValues): TaskSchedule {
	switch (values.scheduleMode) {
		case 'one-off':
			return { mode: 'one-off' };
		case 'rolling-window':
			return {
				mode: 'rolling-window',
				limit: values.rollingLimitEnabled
					? {
							completions: Number(values.rollingLimitCompletions),
							every: Number(values.rollingLimitEvery),
							unit: values.rollingLimitUnit
						}
					: null
			};
		case 'after-completion':
			return {
				mode: 'after-completion',
				every: Number(values.afterEvery),
				unit: values.afterUnit
			};
		case 'scheduled': {
			return {
				mode: 'scheduled',
				anchorLocal: values.scheduledAnchorLocal,
				frequency: values.scheduledFrequency,
				interval: Number(values.scheduledInterval),
				weekdays: values.scheduledWeekdays,
				monthlyPattern: monthlyPatternFromValues(values),
				end: scheduleEndFromValues(values)
			};
		}
		default:
			return assertNever(values.scheduleMode, 'schedule mode');
	}
}

function scheduleEndFromValues(values: TaskEditorFormValues): TaskScheduleEnd {
	switch (values.scheduledEndKind) {
		case 'until':
			return { kind: 'until', untilLocal: values.scheduledUntilLocal };
		case 'count':
			return { kind: 'count', count: Number(values.scheduledCount) };
		case 'never':
			return { kind: 'never' };
		default:
			return assertNever(values.scheduledEndKind, 'schedule end');
	}
}

function monthlyPatternFromValues(values: TaskEditorFormValues): TaskMonthlyPattern | undefined {
	if (values.scheduledFrequency !== 'month') {
		return undefined;
	}
	if (values.scheduledMonthlyPatternKind === 'nth-weekday') {
		return {
			kind: 'nth-weekday',
			ordinal: parseScheduledOrdinal(values.scheduledOrdinal),
			weekday: values.scheduledWeekday
		};
	}
	return { kind: 'day-of-month', day: Number(values.scheduledDayOfMonth) };
}

export function taskInputFromEditorForm(values: TaskEditorFormValues): TaskInput {
	return {
		title: values.title.trim(),
		description: values.description.trim() === '' ? null : values.description.trim(),
		active: values.active,
		creditsAwarded: Number(values.creditsAwarded),
		completionMessages: parseCompletionMessages(values.completionMessagesText),
		timezoneOwnerUserId: values.timezoneOwnerUserId,
		schedule: scheduleFromValues(values)
	};
}
