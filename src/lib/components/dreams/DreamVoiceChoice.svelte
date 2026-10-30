<script lang="ts">
	import type { ChosenVoices } from '$lib/dream/voices';
	import type { DreamSession } from '$lib/dream-browser/session.svelte';
	import { FISH_VOICE_PRESETS, type FishVoicePresetId } from '$lib/server-settings';
	import VoiceSample from './VoiceSample.svelte';

	/**
	 * The voice one person in a daydream is read in (docs/dreams.md, "Voices"):
	 * the user's own lines' or a character's, which is the narrator's until
	 * one is chosen, with a button to hear it. In the voices dialog, and on a
	 * character's card while reading aloud is on. The voice that suits them,
	 * from how they were described, is marked, but never chosen for them.
	 */
	let {
		session,
		id,
		suits,
		who
	}: {
		session: DreamSession;
		/** Their element's id, or `you`. */
		id: string;
		suits: FishVoicePresetId | null;
		/** Who they are, to name the button that plays their voice. */
		who: string;
	} = $props();

	type WaSelectEvent = CustomEvent<{ item: HTMLElement & { value?: string } }>;

	const DEFAULT = 'default';

	const chosen = $derived<ChosenVoices>(session.setup?.voices ?? {});
	const narrator = $derived(chosen.narrator ?? null);
	const own = $derived(chosen.characters?.[id] ?? null);

	function presetName(preset: FishVoicePresetId): string {
		return FISH_VOICE_PRESETS.find((entry) => entry.id === preset)?.label ?? '';
	}

	/** Their voice now, for the button and the play button's name. */
	const current = $derived(own ? presetName(own) : 'Same as the narrator');

	function choose(event: WaSelectEvent) {
		const value = event.detail.item.value ?? DEFAULT;
		const preset = FISH_VOICE_PRESETS.find((entry) => entry.id === value)?.id ?? null;
		void session.setVoice(id, preset);
	}
</script>

<span class="voice-choice">
	<!-- Their voice as it is now: their own, or the narrator's. -->
	<VoiceSample
		voice={own ?? narrator ?? 'narrator'}
		label={who === 'You' ? 'Hear your voice' : `Hear ${who}’s voice`}
	/>
	<wa-dropdown placement="bottom-end" onwa-select={choose}>
		<wa-button slot="trigger" size="s" appearance="outlined" with-caret>{current}</wa-button>
		<wa-dropdown-item type="checkbox" value={DEFAULT} checked={own === null}>
			Same as the narrator
			<span slot="details"><VoiceSample voice={narrator ?? 'narrator'} label="Hear the narrator" /></span>
		</wa-dropdown-item>
		{#each FISH_VOICE_PRESETS as preset (preset.id)}
			<wa-dropdown-item type="checkbox" value={preset.id} checked={own === preset.id}>
				{preset.label}{preset.id === suits ? ' · suits them' : ''}
				<small class="line">{preset.description}</small>
				<span slot="details"><VoiceSample voice={preset.id} label={`Hear ${preset.label}`} /></span>
			</wa-dropdown-item>
		{/each}
	</wa-dropdown>
</span>

<style>
	.voice-choice {
		display: inline-flex;
		align-items: center;
		gap: var(--wa-space-2xs);
	}

	/* A voice's description under its name in the menu. */
	.line {
		display: block;
		max-width: 20rem;
		color: var(--wa-color-text-quiet);
		white-space: normal;
	}
</style>
