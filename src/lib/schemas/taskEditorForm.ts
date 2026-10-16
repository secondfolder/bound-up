import { z } from 'zod';
import { SEALED_PATTERN } from '$lib/sealed';
import { isClientId } from '$lib/vault';

const WHOLE_NUMBER = /^\d+$/;
const LINE_BREAK = /\r?\n/;

const localDateTimeSchema = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Please choose a valid date and time');

const userIdSchema = z.string().trim().min(1, 'Malformed user id');
const repeatUnitSchema = z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']);
const weekdaySchema = z.enum(['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']);

/**
 * Everything about a task the server sees: what it schedules, credits and
 * checks. The content — title, description, completion messages — is sealed
 * in the browser and never reaches the server as text; see
 * `taskSealedSubmitSchema` below and docs/tasks.md.
 */
const taskSettingsFields = {
	active: z.boolean(),
	creditsAwarded: z.string(),
	timezoneOwnerUserId: userIdSchema,
	scheduleMode: z.enum(['one-off', 'rolling-window', 'after-completion', 'scheduled']),
	rollingLimitEnabled: z.boolean(),
	rollingLimitCompletions: z.string(),
	rollingLimitEvery: z.string(),
	rollingLimitUnit: repeatUnitSchema,
	afterEvery: z.string(),
	afterUnit: repeatUnitSchema,
	scheduledAnchorLocal: z.string(),
	scheduledFrequency: z.enum(['day', 'week', 'month', 'year']),
	scheduledInterval: z.string(),
	scheduledWeekdays: z.array(weekdaySchema),
	scheduledMonthlyPatternKind: z.enum(['day-of-month', 'nth-weekday']),
	scheduledDayOfMonth: z.string(),
	scheduledOrdinal: z.enum(['1', '2', '3', '4', '-1']),
	scheduledWeekday: weekdaySchema,
	scheduledEndKind: z.enum(['never', 'until', 'count']),
	scheduledUntilLocal: z.string(),
	scheduledCount: z.string()
};

type TaskSettingsValues = z.output<z.ZodObject<typeof taskSettingsFields>>;

/** The checks on the settings, shared by the editor and the sealed submit. */
function checkSettings(data: TaskSettingsValues, ctx: z.RefinementCtx): void {
	if (!WHOLE_NUMBER.test(data.creditsAwarded) || Number(data.creditsAwarded) < 0) {
		ctx.addIssue({
			code: 'custom',
			path: ['creditsAwarded'],
			message: WHOLE_NUMBER.test(data.creditsAwarded)
				? 'Credits cannot be negative'
				: 'Please enter a whole number'
		});
	}

	if (data.scheduleMode === 'rolling-window' && data.rollingLimitEnabled) {
		if (
			!WHOLE_NUMBER.test(data.rollingLimitCompletions) ||
			Number(data.rollingLimitCompletions) < 1
		) {
			ctx.addIssue({
				code: 'custom',
				path: ['rollingLimitCompletions'],
				message: 'Please enter at least 1'
			});
		}
		if (!WHOLE_NUMBER.test(data.rollingLimitEvery) || Number(data.rollingLimitEvery) < 1) {
			ctx.addIssue({
				code: 'custom',
				path: ['rollingLimitEvery'],
				message: 'Please enter at least 1'
			});
		}
	}

	if (
		data.scheduleMode === 'after-completion' &&
		(!WHOLE_NUMBER.test(data.afterEvery) || Number(data.afterEvery) < 1)
	) {
		ctx.addIssue({
			code: 'custom',
			path: ['afterEvery'],
			message: 'Please enter at least 1'
		});
	}

	if (data.scheduleMode === 'scheduled') {
		if (!localDateTimeSchema.safeParse(data.scheduledAnchorLocal).success) {
			ctx.addIssue({
				code: 'custom',
				path: ['scheduledAnchorLocal'],
				message: 'Please choose a valid date and time'
			});
		}
		if (!WHOLE_NUMBER.test(data.scheduledInterval) || Number(data.scheduledInterval) < 1) {
			ctx.addIssue({
				code: 'custom',
				path: ['scheduledInterval'],
				message: 'Please enter at least 1'
			});
		}
		if (data.scheduledFrequency === 'week' && data.scheduledWeekdays.length === 0) {
			ctx.addIssue({
				code: 'custom',
				path: ['scheduledWeekdays'],
				message: 'Choose at least one day'
			});
		}
		if (
			data.scheduledFrequency === 'month' &&
			data.scheduledMonthlyPatternKind === 'day-of-month' &&
			(!WHOLE_NUMBER.test(data.scheduledDayOfMonth) ||
				Number(data.scheduledDayOfMonth) < 1 ||
				Number(data.scheduledDayOfMonth) > 31)
		) {
			ctx.addIssue({
				code: 'custom',
				path: ['scheduledDayOfMonth'],
				message: 'Please enter a day between 1 and 31'
			});
		}
		if (
			data.scheduledEndKind === 'until' &&
			!localDateTimeSchema.safeParse(data.scheduledUntilLocal).success
		) {
			ctx.addIssue({
				code: 'custom',
				path: ['scheduledUntilLocal'],
				message: 'Please choose a valid date and time'
			});
		}
		if (
			data.scheduledEndKind === 'count' &&
			(!WHOLE_NUMBER.test(data.scheduledCount) || Number(data.scheduledCount) < 1)
		) {
			ctx.addIssue({
				code: 'custom',
				path: ['scheduledCount'],
				message: 'Please enter at least 1'
			});
		}
	}
}

/**
 * The editor, in the browser: the settings and the content as typed. Never
 * posted as it is — the content fields are sealed and replaced before the
 * form leaves the page (`sealTaskSubmission` in `sealed-forms.ts`).
 */
export const taskEditorFormSchema = z
	.object({
		title: z.string().max(80, 'Please keep this to 80 characters or fewer'),
		/**
		 * The editor's own working copy of the description, which is a serialised
		 * rich-text document rather than prose. Its length is not the reader's
		 * length, so the 500-character limit is applied to the visible text when
		 * the content is sealed (`taskKind`) — checking the raw string here would
		 * refuse a two-sentence description.
		 */
		description: z.string(),
		completionMessagesText: z.string(),
		...taskSettingsFields
	})
	.superRefine((data, ctx) => {
		if (data.title.trim().length === 0) {
			ctx.addIssue({ code: 'custom', path: ['title'], message: 'Please enter a task title' });
		}
		const completionMessages = data.completionMessagesText
			.split(LINE_BREAK)
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
		if (completionMessages.length > 20) {
			ctx.addIssue({
				code: 'custom',
				path: ['completionMessagesText'],
				message: 'Please keep this to 20 completion messages or fewer'
			});
		}
		checkSettings(data, ctx);
	});

export type TaskEditorFormSchema = typeof taskEditorFormSchema;

/**
 * What a task form actually posts: the settings, and the content sealed into
 * the scope's vault in place of the three text fields. The server validates
 * this; the content it can check only for shape (see `taskContentProblem`).
 */
export const taskSealedSubmitSchema = z
	.object({
		...taskSettingsFields,
		/** The task's id: chosen by the browser on create, the task's own on edit. */
		recordId: z.string().refine(isClientId, 'Malformed id'),
		vaultId: z.string().refine(isClientId, 'Malformed id'),
		ciphertext: z
			.string()
			.min(1)
			.max(64 * 1024)
			.regex(SEALED_PATTERN),
		payloadVersion: z.coerce.number().int().positive(),
		completionMessageCount: z.coerce.number().int().min(0).max(20),
		/** On edit: the revision the editor opened, for compare-and-swap. */
		expectedRevision: z.coerce.number().int().min(0).optional()
	})
	.superRefine(checkSettings);

export type TaskSealedSubmit = z.output<typeof taskSealedSubmitSchema>;
