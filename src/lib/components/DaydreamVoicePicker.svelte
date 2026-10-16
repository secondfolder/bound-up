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
		voiceProblem
	} from '$lib/daydream';
	import { startOpen } from './details';

	/**
	 * How the story is told: who tells it, and where the user stands in it.
	 * Separate from the characters, so a story can be told with none at all —
	 * a narrator talking to you, or an impersonal set of rules — or watched
	 * from outside with several. The presets fill both at once, and are all
	 * most people need; "Fine-tune how it's told" opens the two settings
	 * underneath them, where a combination that could never work is disabled
	 * with a line saying why.
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
	const id = $props.id();

	const matchesPreset = (voice: DaydreamVoice) =>
		DAYDREAM_VOICE_PRESETS.some(
			(preset) => voice.narrator === preset.voice.narrator && voice.stance === preset.voice.stance
		);
	// svelte-ignore state_referenced_locally
	// Captured once: open from the start for a voice no preset gives, so a
	// customised one is never hidden, and then the user's to open and close.
	const customised = !matchesPreset(value) || value.protagonistName.trim() !== '';

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
			: 'This narrator needs you in the story';
	}

	function nameField(node: HTMLElement & { value: string }) {
		const update = () => set({ protagonistName: node.value });
		node.addEventListener('input', update);
		return () => node.removeEventListener('input', update);
	}
</script>

<div class="voice">
	<div class="presets">
		{#each DAYDREAM_VOICE_PRESETS as preset (preset.id)}
			{const chosen = $derived(value.narrator === preset.voice.narrator && value.stance === preset.voice.stance)}
			<!-- A choice that fills two settings: a native button with aria-pressed,
			     which wa-button would not forward (AGENTS.md). -->
			<button type="button" class="preset" aria-pressed={chosen} onclick={() => set(preset.voice)}>
				<span class="label">{preset.label}</span>
				<span class="hint">{preset.hint}</span>
			</button>
		{/each}
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
							onchange={() => set({ narrator: choice.value })}
						/>
						<span>
							{choice.label}
							<small>{blocked ?? choice.hint}</small>
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
							<small>{blocked ?? choice.hint}</small>
						</span>
					</label>
				{/each}
			</fieldset>
		</div>

		{#if value.stance !== 'absent'}
			<wa-input
				{@attach nameField}
				label={value.stance === 'persona' ? 'Who you are playing' : 'What the story calls you (optional)'}
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

	.presets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(10rem, 100%), 1fr));
		gap: 0.5rem;
	}

	.preset {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		/* A grid item's minimum is its content's by default, and a button does
		   not wrap its text, so a long hint pushed out past the button's edge. */
		min-inline-size: 0;
		block-size: 100%;
		white-space: normal;
		overflow-wrap: anywhere;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 0.6rem;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;

		.label {
			font-weight: 600;
		}

		.hint {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}

		&[aria-pressed='true'] {
			border-color: var(--wa-color-brand-border-loud, var(--wa-color-surface-border));
			background: var(--wa-color-brand-fill-quiet);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
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
