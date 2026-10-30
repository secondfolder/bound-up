<script lang="ts">
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import { YOU_ID } from '$lib/dream/colours';
	import { type DreamElement, elementLabel } from '$lib/dream/elements';
	import { type ChosenVoices, voiceFor } from '$lib/dream/voices';
	import type { DreamSession } from '$lib/dream-browser/session.svelte';
	import { FISH_VOICE_PRESETS, type FishVoicePresetId } from '$lib/server-settings';
	import DreamVoiceChoice from './DreamVoiceChoice.svelte';
	import { elementIcon } from './element-icons';
	import VoiceSample from './VoiceSample.svelte';

	/**
	 * The voices a daydream is read in (docs/dreams.md, "Voices"): the
	 * narrator's, and the user's own lines' and each character's, which are
	 * the narrator's until one is chosen. Kept with the daydream. The voice that suits a character, from
	 * how they were described, is marked, but never chosen for them.
	 */
	let {
		session,
		characters,
		colours,
		serverNarrator,
		onclose
	}: {
		session: DreamSession;
		characters: readonly DreamElement[];
		colours: ReadonlyMap<string, string>;
		/** The curated voice the server's narrator is, or null for a voice of the admin's own. */
		serverNarrator: FishVoicePresetId | null;
		onclose: () => void;
	} = $props();

	const chosen = $derived<ChosenVoices>(session.setup?.voices ?? {});
	const narrator = $derived(chosen.narrator ?? null);

	type WaSelectEvent = CustomEvent<{ item: HTMLElement & { value?: string } }>;

	const DEFAULT = 'default';

	function presetName(id: FishVoicePresetId | null): string {
		return FISH_VOICE_PRESETS.find((preset) => preset.id === id)?.label ?? '';
	}

	/** What the server's narrator is called in the menu. */
	const serverName = $derived(
		serverNarrator ? `This server’s (${presetName(serverNarrator)})` : 'This server’s'
	);

	function chooseNarrator(event: WaSelectEvent) {
		const value = event.detail.item.value ?? DEFAULT;
		const preset = FISH_VOICE_PRESETS.find((entry) => entry.id === value)?.id ?? null;
		void session.setVoice('narrator', preset);
	}
</script>

<ResponsiveDialog label="Voices" {onclose}>
	<div class="voices">
		<div class="row">
			<span class="who">
				<wa-icon name="book-open" aria-hidden="true"></wa-icon>
				Narrator
			</span>
			<VoiceSample voice={narrator ?? 'narrator'} label="Hear the narrator" />
			<wa-dropdown placement="bottom-end" onwa-select={chooseNarrator}>
				<wa-button slot="trigger" size="s" appearance="outlined" with-caret
					>{narrator ? presetName(narrator) : serverName}</wa-button
				>
				<wa-dropdown-item type="checkbox" value={DEFAULT} checked={narrator === null}>{serverName}</wa-dropdown-item>
				{#each FISH_VOICE_PRESETS as preset (preset.id)}
					<wa-dropdown-item type="checkbox" value={preset.id} checked={narrator === preset.id}>
						{preset.label}
						<small class="line">{preset.description}</small>
					</wa-dropdown-item>
				{/each}
			</wa-dropdown>
		</div>
		{@render speaker(YOU_ID, 'You', 'you', null)}
		{#each characters as character (character.id)}
			{@render speaker(
				character.id,
				elementLabel(character),
				character.type,
				voiceFor(character, session.id, narrator ?? serverNarrator)
			)}
		{/each}
		{#if characters.length === 0}
			<p class="quiet">Nobody else in this daydream speaks.</p>
		{/if}
	</div>
</ResponsiveDialog>

{#snippet speaker(id: string, name: string, type: string, suits: FishVoicePresetId | null)}
	<div class="row">
		<span class="who">
			<wa-icon name={elementIcon(type)} style:color={colours.get(id)} aria-hidden="true"></wa-icon>
			{name}
		</span>
		<DreamVoiceChoice {session} {id} {suits} who={name} />
	</div>
{/snippet}

<style>
	.voices {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-xs);
	}

	.who {
		display: inline-flex;
		flex: 1 1 auto;
		align-items: center;
		gap: var(--wa-space-xs);
		min-width: 0;
		font-weight: var(--wa-font-weight-semibold);
		overflow-wrap: anywhere;
	}

	/* A voice's description under its name in the menu. */
	.line {
		display: block;
		max-width: 20rem;
		color: var(--wa-color-text-quiet);
		white-space: normal;
	}

	.quiet {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}
</style>
