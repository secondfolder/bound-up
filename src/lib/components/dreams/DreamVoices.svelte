<script lang="ts">
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import { type DreamElement, elementLabel } from '$lib/dream/elements';
	import { type ChosenVoices, voiceFor } from '$lib/dream/voices';
	import type { DreamSession } from '$lib/dream-browser/session.svelte';
	import { FISH_VOICE_PRESETS, type FishVoicePresetId } from '$lib/server-settings';
	import { elementIcon } from './element-icons';

	/**
	 * The voices a daydream is read in (docs/dreams.md, "Voices"): the
	 * narrator's, and each character's, which is the narrator's until one is
	 * chosen. Kept with the daydream. The voice that suits a character, from
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

	function choose(who: string, event: WaSelectEvent) {
		const value = event.detail.item.value ?? DEFAULT;
		const preset = FISH_VOICE_PRESETS.find((entry) => entry.id === value)?.id ?? null;
		void session.setVoice(who, preset);
	}

	/** The voice a character is read in now, for the button. */
	function characterVoice(id: string): string {
		const own = chosen.characters?.[id];
		return own ? presetName(own) : 'Same as the narrator';
	}
</script>

<ResponsiveDialog label="Voices" {onclose}>
	<div class="voices">
		<div class="row">
			<span class="who">
				<wa-icon name="book-open" aria-hidden="true"></wa-icon>
				Narrator
			</span>
			<wa-dropdown placement="bottom-end" onwa-select={(event: WaSelectEvent) => choose('narrator', event)}>
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
		{#each characters as character (character.id)}
			{const suits = $derived(voiceFor(character, session.id, narrator ?? serverNarrator))}
			{const own = $derived(chosen.characters?.[character.id] ?? null)}
			<div class="row">
				<span class="who">
					<wa-icon name={elementIcon(character.type)} style:color={colours.get(character.id)} aria-hidden="true"
					></wa-icon>
					{elementLabel(character)}
				</span>
				<wa-dropdown
					placement="bottom-end"
					onwa-select={(event: WaSelectEvent) => choose(character.id, event)}
				>
					<wa-button slot="trigger" size="s" appearance="outlined" with-caret
						>{characterVoice(character.id)}</wa-button
					>
					<wa-dropdown-item type="checkbox" value={DEFAULT} checked={own === null}>Same as the narrator</wa-dropdown-item>
					{#each FISH_VOICE_PRESETS as preset (preset.id)}
						<wa-dropdown-item type="checkbox" value={preset.id} checked={own === preset.id}>
							{preset.label}{preset.id === suits ? ' · suits them' : ''}
							<small class="line">{preset.description}</small>
						</wa-dropdown-item>
					{/each}
				</wa-dropdown>
			</div>
		{/each}
		{#if characters.length === 0}
			<p class="quiet">Nobody in this daydream speaks but the narrator.</p>
		{/if}
	</div>
</ResponsiveDialog>

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
