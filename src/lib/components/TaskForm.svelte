<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { Infer, SuperForm } from 'sveltekit-superforms';
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TaskTimeZoneOwnerToggle from '$lib/components/TaskTimeZoneOwnerToggle.svelte';
	import { DOCUMENT_FEATURES } from '$lib/richtext-editor';
	import { type TaskEditorFormSchema, taskEditorFormSchema } from '$lib/schemas/taskEditorForm';
	import type { TaskWeekday } from '$lib/types';

	type TimeZoneContext = {
		viewerUserId: string;
		viewerTimezone: string;
		counterpartUserId: string;
		counterpartTimezone: string;
		counterpartName: string;
	};

	let {
		superform,
		submitLabel,
		timeZoneContext = null
	}: {
		superform: SuperForm<Infer<TaskEditorFormSchema>>;
		submitLabel: string;
		timeZoneContext?: TimeZoneContext | null;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captures the initial superform once on purpose: the stores it exposes are
	// the live connection, so there is nothing to gain from re-deriving it.
	const { form, errors, submitting } = superform;
	// svelte-ignore state_referenced_locally
	// The comparison baseline belongs to this mounted form instance. It is
	// intentionally captured once and then optionally rebased after mount.
	let initialValues = $state(structuredClone(superform.capture().data));
	let mounted = $state(false);
	let userEdited = $state(false);

	onMount(() => {
		mounted = true;
		void tick().then(() => {
			if (!userEdited) {
				initialValues = structuredClone(superform.capture().data);
			}
		});
	});

	function markUserEdited() {
		if (!mounted) {
			return;
		}
		userEdited = true;
	}

	/**
	 * Any edit in the form marks it edited, heard in the capture phase on the
	 * form itself: the fields are Web Awesome elements that write to the
	 * superform on their own (InputField, SelectField, CheckboxField), and their
	 * events reach the form composed but not through Svelte's delegation.
	 */
	const hearEdits: Attachment<HTMLFormElement> = (formElement) => {
		formElement.addEventListener('input', markUserEdited, { capture: true });
		formElement.addEventListener('change', markUserEdited, { capture: true });
		return () => {
			formElement.removeEventListener('input', markUserEdited, { capture: true });
			formElement.removeEventListener('change', markUserEdited, { capture: true });
		};
	};

	/**
	 * The description is a rich-text document, so it arrives as a serialised
	 * string from the editor rather than from a DOM input. It still goes through
	 * the same superforms field, so tainting, validation and the save-button
	 * promotion all behave exactly as they do for every other field.
	 */
	function setDescription(stored: string) {
		markUserEdited();
		$form.description = stored;
	}

	/**
	 * A weekday's box, followed with a listener on the element for the reason
	 * SelectField gives. The days are one array field, so they are not
	 * CheckboxFields: each box adds or removes its own day.
	 */
	const weekdayBox =
		(weekday: TaskWeekday): Attachment<HTMLElement> =>
		(element) => {
			const box = element as HTMLElement & { checked?: boolean };
			const sync = () => toggleScheduledWeekday(weekday, Boolean(box.checked));
			box.addEventListener('change', sync);
			return () => box.removeEventListener('change', sync);
		};

	function toggleScheduledWeekday(weekday: TaskWeekday, checked: boolean) {
		if (checked) {
			if (!$form.scheduledWeekdays.includes(weekday)) {
				$form.scheduledWeekdays = [...$form.scheduledWeekdays, weekday];
			}
			return;
		}

		$form.scheduledWeekdays = $form.scheduledWeekdays.filter((value) => value !== weekday);
	}

	function firstErrorMessage(value: unknown): string | null {
		if (typeof value === 'string') {
			return value;
		}

		if (Array.isArray(value)) {
			for (const entry of value) {
				const message = firstErrorMessage(entry);
				if (message) {
					return message;
				}
			}
			return null;
		}

		if (!value || typeof value !== 'object') {
			return null;
		}

		if ('_errors' in value) {
			const message = firstErrorMessage((value as { _errors?: unknown })._errors);
			if (message) {
				return message;
			}
		}

		for (const entry of Object.values(value)) {
			const message = firstErrorMessage(entry);
			if (message) {
				return message;
			}
		}

		return null;
	}

	const hasUnsavedChanges = $derived(
		userEdited && JSON.stringify($form) !== JSON.stringify(initialValues)
	);
	const formIsValid = $derived(taskEditorFormSchema.safeParse($form).success);
	const hasValidUnsavedChanges = $derived(hasUnsavedChanges && formIsValid);

	const UNIT_OPTIONS = [
		{ value: 'minute', label: 'Minutes' },
		{ value: 'hour', label: 'Hours' },
		{ value: 'day', label: 'Days' },
		{ value: 'week', label: 'Weeks' },
		{ value: 'month', label: 'Months' },
		{ value: 'year', label: 'Years' }
	];
	const MODE_OPTIONS = [
		{ value: 'one-off', label: 'One-off' },
		{ value: 'rolling-window', label: 'Repeat anytime' },
		{ value: 'after-completion', label: 'After completion' },
		{ value: 'scheduled', label: 'On a schedule' }
	];
	const FREQUENCY_OPTIONS = [
		{ value: 'day', label: 'Daily' },
		{ value: 'week', label: 'Weekly' },
		{ value: 'month', label: 'Monthly' },
		{ value: 'year', label: 'Yearly' }
	];
	const MONTHLY_PATTERN_OPTIONS = [
		{ value: 'day-of-month', label: 'Day of month' },
		{ value: 'nth-weekday', label: 'Nth weekday' }
	];
	const ORDINAL_OPTIONS = [
		{ value: '1', label: 'First' },
		{ value: '2', label: 'Second' },
		{ value: '3', label: 'Third' },
		{ value: '4', label: 'Fourth' },
		{ value: '-1', label: 'Last' }
	];
	const END_OPTIONS = [
		{ value: 'never', label: 'Never' },
		{ value: 'until', label: 'On a date' },
		{ value: 'count', label: 'After a number of times' }
	];

	const weekdayOptions: { value: TaskWeekday; label: string }[] = [
		{ value: 'mo', label: 'Mon' },
		{ value: 'tu', label: 'Tue' },
		{ value: 'we', label: 'Wed' },
		{ value: 'th', label: 'Thu' },
		{ value: 'fr', label: 'Fri' },
		{ value: 'sa', label: 'Sat' },
		{ value: 'su', label: 'Sun' }
	];
</script>

<form method="POST" use:superform.enhance class="panel task-form" {@attach hearEdits}>
	<input type="hidden" name="timezoneOwnerUserId" value={$form.timezoneOwnerUserId} />

	<InputField {superform} field="title" title="Title" type="text" maxlength="80" required />
	<div class="description">
		<!-- Not a <label>: the editor is named by its own ariaLabel, and a label
		     wrapping it would turn a click anywhere on the toolbar into focus. -->
		<span class="label" aria-hidden="true">Description</span>
		<!--
			A hidden input carries the serialised document, so the form posts the
			same way it always has and the action needs no special case.
		-->
		<input type="hidden" name="description" value={$form.description ?? ''} />
		<div class="richtext-field">
			<RichTextEditor
				value={$form.description ?? ''}
				onChange={setDescription}
				features={DOCUMENT_FEATURES}
				toolbar
				placeholder="What does this involve?"
				ariaLabel="Description"
			/>
		</div>
		{#if $errors.description}<span class="invalid">{$errors.description}</span>{/if}
	</div>
	<div class="editor-row">
		<InputField
			{superform}
			field="creditsAwarded"
			title="Credits awarded"
			type="number"
			min="0"
			step="1"
			required
		/>
		<CheckboxField {superform} field="active" title="Active" />
	</div>
	<!-- Optional, though the schema's plain string would make superforms mark
	     it required: a task needs no completion message. -->
	<InputField
		{superform}
		field="completionMessagesText"
		title="Completion messages"
		type="textarea"
		rows="4"
		placeholder="One message per line"
		required={false}
	/>

	<section class="schedule-section">
		<h3>Repeat</h3>
		<SelectField {superform} field="scheduleMode" title="Mode" options={MODE_OPTIONS} />

		{#if $form.scheduleMode === 'rolling-window'}
			<CheckboxField
				{superform}
				field="rollingLimitEnabled"
				title="Limit completions per period"
			/>
			{#if $form.rollingLimitEnabled}
				<div class="editor-row">
					<InputField
						{superform}
						field="rollingLimitCompletions"
						title="Completions"
						type="number"
						min="1"
						step="1"
					/>
					<InputField
						{superform}
						field="rollingLimitEvery"
						title="Every"
						type="number"
						min="1"
						step="1"
					/>
					<SelectField {superform} field="rollingLimitUnit" title="Unit" options={UNIT_OPTIONS} />
				</div>
			{/if}
		{/if}

		{#if $form.scheduleMode === 'after-completion'}
			<div class="editor-row">
				<InputField {superform} field="afterEvery" title="Every" type="number" min="1" step="1" />
				<SelectField {superform} field="afterUnit" title="Unit" options={UNIT_OPTIONS} />
			</div>
		{/if}

		{#if $form.scheduleMode === 'scheduled'}
			<div class="schedule-row">
				<InputField
					{superform}
					field="scheduledAnchorLocal"
					title="Starts at"
					type="datetime-local"
				/>
				{#if timeZoneContext}
					<TaskTimeZoneOwnerToggle
						viewerUserId={timeZoneContext.viewerUserId}
						viewerTimezone={timeZoneContext.viewerTimezone}
						counterpartUserId={timeZoneContext.counterpartUserId}
						counterpartTimezone={timeZoneContext.counterpartTimezone}
						counterpartName={timeZoneContext.counterpartName}
						onSelect={markUserEdited}
						bind:value={$form.timezoneOwnerUserId}
					/>
				{/if}
			</div>

			<div class="editor-row">
				<SelectField
					{superform}
					field="scheduledFrequency"
					title="Frequency"
					options={FREQUENCY_OPTIONS}
				/>
				<InputField
					{superform}
					field="scheduledInterval"
					title="Every"
					type="number"
					min="1"
					step="1"
				/>
			</div>

			{#if $form.scheduledFrequency === 'week'}
				<fieldset>
					<legend>Days</legend>
					<div class="weekday-grid">
						{#each weekdayOptions as option (option.value)}
							<wa-checkbox
								name="scheduledWeekdays"
								value={option.value}
								checked={$form.scheduledWeekdays.includes(option.value)}
								{@attach weekdayBox(option.value)}>{option.label}</wa-checkbox
							>
						{/each}
					</div>
					{#if firstErrorMessage($errors.scheduledWeekdays)}
						<span class="invalid">{firstErrorMessage($errors.scheduledWeekdays)}</span>
					{/if}
				</fieldset>
			{/if}

			{#if $form.scheduledFrequency === 'month'}
				<div class="editor-row">
					<SelectField
						{superform}
						field="scheduledMonthlyPatternKind"
						title="Monthly pattern"
						options={MONTHLY_PATTERN_OPTIONS}
					/>
					{#if $form.scheduledMonthlyPatternKind === 'day-of-month'}
						<InputField
							{superform}
							field="scheduledDayOfMonth"
							title="Day"
							type="number"
							min="1"
							max="31"
							step="1"
						/>
					{:else}
						<SelectField
							{superform}
							field="scheduledOrdinal"
							title="Ordinal"
							options={ORDINAL_OPTIONS}
						/>
						<SelectField
							{superform}
							field="scheduledWeekday"
							title="Weekday"
							options={weekdayOptions}
						/>
					{/if}
				</div>
			{/if}

			<div class="editor-row">
				<SelectField {superform} field="scheduledEndKind" title="Ends" options={END_OPTIONS} />
				{#if $form.scheduledEndKind === 'until'}
					<InputField
						{superform}
						field="scheduledUntilLocal"
						title="Until"
						type="datetime-local"
					/>
				{:else if $form.scheduledEndKind === 'count'}
					<InputField
						{superform}
						field="scheduledCount"
						title="Count"
						type="number"
						min="1"
						step="1"
					/>
				{/if}
			</div>
			{#if $form.scheduledEndKind === 'until' && timeZoneContext}
				<TaskTimeZoneOwnerToggle
					viewerUserId={timeZoneContext.viewerUserId}
					viewerTimezone={timeZoneContext.viewerTimezone}
					counterpartUserId={timeZoneContext.counterpartUserId}
					counterpartTimezone={timeZoneContext.counterpartTimezone}
					counterpartName={timeZoneContext.counterpartName}
					onSelect={markUserEdited}
					bind:value={$form.timezoneOwnerUserId}
				/>
			{/if}
		{/if}
	</section>

	<wa-button
		type="submit"
		appearance={hasValidUnsavedChanges ? 'accent' : 'outlined'}
		variant={hasValidUnsavedChanges ? 'brand' : 'neutral'}
		disabled={$submitting}
	>
		{submitLabel}
	</wa-button>
	{#if $errors._errors}<span class="invalid">{$errors._errors}</span>{/if}
</form>

<style>
	/* The same panel as the tasks and rewards pages' sections. Without a fill
	   it was the one translucent card in the app, the wash showing through
	   behind the fields. */
	.panel {
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-panel-border-radius);
		padding: var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		background: color-mix(
			in srgb,
			var(--wa-color-surface-default) 94%,
			var(--wa-color-brand-fill-quiet)
		);

		@media (width < 40rem) {
			padding: var(--wa-space-m);
		}
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-form-control-border-radius);
		padding: 0.75rem;
	}

	legend {
		padding-inline: 0.35rem;
		font-weight: var(--wa-form-control-label-font-weight, var(--wa-font-weight-semibold, 600));
	}

	.editor-row,
	.schedule-row,
	.weekday-grid {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		align-items: flex-end;

		/* The fields share the row, and wrap under one another when they
		   cannot each have a usable width. */
		> :global(*) {
			flex: 1 1 10rem;
		}
	}

	.weekday-grid {
		gap: 0.5rem 1rem;

		> :global(*) {
			flex: 0 0 auto;
		}
	}

	.schedule-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	h3 {
		margin: 0;
	}

	/* The description is a rich-text editor, not a Web Awesome field, so its
	   label and box borrow the form controls' tokens to read as one of the
	   wa-inputs around it. */
	.description {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;

		.label {
			font-weight: var(--wa-form-control-label-font-weight, var(--wa-font-weight-semibold, 600));
			color: var(--wa-form-control-label-color, var(--wa-color-text-normal));
		}
	}

	.richtext-field {
		inline-size: 100%;
		box-sizing: border-box;
		min-block-size: 4.5rem;
		max-block-size: 40svh;
		overflow-y: auto;
		padding: 0.6rem var(--wa-form-control-padding-inline, 0.75rem);
		border-radius: var(--wa-form-control-border-radius);
		border: var(--wa-form-control-border-width, 1px) var(--wa-form-control-border-style, solid)
			var(--wa-form-control-border-color);
		background: var(--wa-form-control-background-color);
	}

	.richtext-field:focus-within {
		outline: var(--wa-focus-ring);
		outline-offset: var(--wa-focus-ring-offset, -1px);
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}

	@media (max-width: 640px) {
		.editor-row,
		.schedule-row {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
