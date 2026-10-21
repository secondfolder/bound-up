<script lang="ts">
	import {
		DAYDREAM_LIMITS,
		DAYDREAM_NARRATORS,
		DAYDREAM_STANCES,
		DAYDREAM_VOICE_PRESETS,
		type DaydreamNarrator,
		type DaydreamStance,
		type DaydreamVoice,
		voiceCanWork,
		voicePreset,
		voiceProblem
	} from '$lib/daydream';
	import { formatPassage, type Run } from '$lib/daydream/passage-format';
	import { startOpen } from './details';

	/**
	 * How the story is told: who tells it, and where the user stands in it.
	 * Separate from the characters, so a story can be told with none at all —
	 * a narrator talking to you, or an impersonal set of rules — or watched
	 * from outside with several. The presets fill both at once, and are all
	 * most people need; "Fine-tune how it's told" opens the two settings
	 * underneath them, where a combination that could never work is disabled
	 * with a line saying why.
	 *
	 * The options are names only, and the selected one is described beside
	 * them, with examples of what the story will read like: five
	 * descriptions side by side were a wall of text to compare, where one at
	 * a time can be tried on by choosing it.
	 */
	let {
		value,
		characterCount,
		onchange
	}: {
		value: DaydreamVoice;
		characterCount: number;
		onchange: (voice: DaydreamVoice) => void;
	} = $props();

	const problem = $derived(voiceProblem(value, characterCount));

	/**
	 * An example's words, with its bold and italics drawn as a passage draws
	 * them (`formatPassage`) rather than shown as asterisks: an action in
	 * italics, a monologue's statement in bold.
	 */
	const exampleRuns = (example: string): Run[] =>
		formatPassage(example).flatMap((block) => (block.kind === 'paragraph' ? block.runs : []));

	const runTag = (run: Run) => {
		if (run.bold) {
			return 'strong';
		}
		return run.italic ? 'em' : 'span';
	};
	const id = $props.id();

	const preset = $derived(voicePreset(value));
	const narratorShown = $derived(
		DAYDREAM_NARRATORS.find((choice) => choice.value === value.narrator)
	);
	const stanceShown = $derived(DAYDREAM_STANCES.find((choice) => choice.value === value.stance));

	// svelte-ignore state_referenced_locally
	// Captured once: open from the start for a voice no preset gives, so a
	// customised one is never hidden, and then the user's to open and close.
	const customised = voicePreset(value) === undefined || value.protagonistName.trim() !== '';

	function set(patch: Partial<DaydreamVoice>) {
		onchange({ ...value, ...patch });
	}

	/** Why a choice is off, given the other setting, or null when it can work. */
	function narratorBlocked(narrator: DaydreamNarrator): string | null {
		return voiceCanWork({ narrator, stance: value.stance }) ? null : 'Not while you are watching';
	}
	function stanceBlocked(stance: DaydreamStance): string | null {
		return voiceCanWork({ narrator: value.narrator, stance })
			? null
			: 'This narrator needs you in the daydream';
	}

	function nameField(node: HTMLElement & { value: string }) {
		const update = () => set({ protagonistName: node.value });
		node.addEventListener('input', update);
		return () => node.removeEventListener('input', update);
	}
</script>

<!-- One line on purpose: whitespace between the runs would draw as spaces. -->
{#snippet exampleText(example: string)}{#each exampleRuns(example) as run (run.start)}<svelte:element this={runTag(run)} class:italic={run.italic}>{run.text}</svelte:element>{/each}{/snippet}

<div class="voice">
	<div class="choose">
		<div class="options" role="radiogroup" aria-label="How it's told" aria-describedby={`${id}-about`}>
			{#each DAYDREAM_VOICE_PRESETS as choice (choice.id)}
				<label class="option">
					<input
						type="radio"
						name={`${id}-preset`}
						value={choice.id}
						checked={preset?.id === choice.id}
						onchange={() => set(choice.voice)}
					/>
					<span>{choice.label}</span>
				</label>
			{/each}
		</div>

		<!-- Polite: it changes as an option is chosen, and says what that choice means. -->
		<div class="about" id={`${id}-about`} aria-live="polite">
			{#if preset}
				<p class="description">{preset.description}</p>
				<ul class="examples" aria-label="For example">
					{#each preset.examples as example (example)}<li>{@render exampleText(example)}</li>{/each}
				</ul>
			{:else if narratorShown && stanceShown}
				<p class="description">{narratorShown.description} {stanceShown.description}</p>
				<ul class="examples" aria-label="For example"><li>{@render exampleText(narratorShown.example)}</li></ul>
			{/if}
		</div>
	</div>

	{#if problem}<p class="problem" role="status">{problem}</p>{/if}

	<wa-details summary="Fine-tune how it's told" class="fine-tune" {@attach startOpen(customised)}>
		<div class="pickers">
			<fieldset>
				<legend>Who tells it</legend>
				{#each DAYDREAM_NARRATORS as choice (choice.value)}
					{const blocked = $derived(narratorBlocked(choice.value))}
					<label class="choice" class:blocked>
						<input
							type="radio"
							name={`${id}-narrator`}
							value={choice.value}
							checked={value.narrator === choice.value}
							disabled={blocked !== null}
							onchange={() =>
								// Only a system governs anyone, so any other narrator clears it.
								set(
									choice.value === 'impersonal'
										? { narrator: choice.value }
										: { narrator: choice.value, governs: undefined }
								)}
						/>
						<span>
							{choice.label}
							{#if blocked}<small>{blocked}</small>{/if}
						</span>
					</label>
				{/each}
			</fieldset>
			<fieldset>
				<legend>Where you are</legend>
				{#each DAYDREAM_STANCES as choice (choice.value)}
					{const blocked = $derived(stanceBlocked(choice.value))}
					<label class="choice" class:blocked>
						<input
							type="radio"
							name={`${id}-stance`}
							value={choice.value}
							checked={value.stance === choice.value}
							disabled={blocked !== null}
							onchange={() => set({ stance: choice.value })}
						/>
						<span>
							{choice.label}
							{#if blocked}<small>{blocked}</small>{/if}
						</span>
					</label>
				{/each}
			</fieldset>
		</div>

		{#if value.narrator === 'impersonal' && value.stance !== 'absent'}
			<!-- Someone who watches a system always watches it govern a character. -->
			<fieldset class="governs">
				<legend>Whom the system governs</legend>
				<label class="choice">
					<input
						type="radio"
						name={`${id}-governs`}
						value="user"
						checked={value.governs !== 'character'}
						onchange={() => set({ governs: undefined })}
					/>
					<span>You</span>
				</label>
				<label class="choice">
					<input
						type="radio"
						name={`${id}-governs`}
						value="character"
						checked={value.governs === 'character'}
						onchange={() => set({ governs: 'character' })}
					/>
					<span>A character, and it answers to you</span>
				</label>
			</fieldset>
		{/if}

		{#if value.stance !== 'absent'}
			<wa-input
				{@attach nameField}
				label={value.stance === 'persona' ? 'Who you are playing' : 'What the daydream calls you (optional)'}
				value={value.protagonistName}
				maxlength={DAYDREAM_LIMITS.protagonistName}
			></wa-input>
		{/if}
	</wa-details>
</div>

<style>
	.voice {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* The list and the description side by side where there is room for
	   both, the description under the list where there is not. */
	.choose {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
		gap: 0.75rem;
		align-items: start;
	}

	.options {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.375rem;
	}

	.option {
		display: flex;
		box-sizing: border-box;
		inline-size: 100%;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 0.6rem;
		font-weight: 600;
		cursor: pointer;

		&:has(input:checked) {
			border-color: var(--wa-color-brand-border-loud, var(--wa-color-surface-border));
			background: var(--wa-color-brand-fill-quiet);
		}

		&:has(input:focus-visible) {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.about {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 0.6rem;
		background: var(--wa-color-surface-lowered);

		.description {
			margin: 0;
		}
	}

	.italic {
		font-style: italic;
	}

	.examples {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;

		/* Upright, set off by the rule and colour instead: italics inside an
		   example mean an action, as they do in a passage. */
		li {
			padding-inline-start: 0.75rem;
			border-inline-start: 2px solid var(--wa-color-surface-border);
			color: var(--wa-color-text-quiet);
		}

		strong {
			color: var(--wa-color-text-normal);
		}
	}

	.fine-tune::part(content) {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.pickers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
		gap: 0.75rem;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;

		legend {
			padding: 0;
			margin-block-end: 0.35rem;
			font-weight: 600;
		}
	}

	.choice {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;

		small {
			display: block;
			color: var(--wa-color-text-quiet);
		}

		&.blocked {
			opacity: 0.6;
		}
	}

	.problem {
		margin: 0;
		color: var(--wa-color-text-warning, var(--wa-color-text-quiet));
	}
</style>
