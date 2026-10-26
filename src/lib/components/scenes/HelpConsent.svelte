<script lang="ts">
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import type { HelpGate } from '$lib/scenes/help-gate.svelte';

	/**
	 * What someone is told, and agrees to, before a scene's text first goes
	 * to the model. Shown once, the first time they press a button that asks
	 * for help; the server refuses to send anything until they have agreed.
	 * Says who can read what, and nothing about encryption (AGENTS.md).
	 */
	let { gate }: { gate: HelpGate } = $props();

	let dialog: ResponsiveDialog | undefined = $state();
	let agreed = false;

	function answer(yes: boolean) {
		agreed = yes;
		dialog?.close();
	}
</script>

<ResponsiveDialog
	bind:this={dialog}
	label="Before the model helps"
	lightDismiss={false}
	onclose={() => gate.decide(agreed)}
>
	<p>Help is written by an AI language model, which has to read the scene to write it.</p>
	<ul>
		<li>
			When you ask, what you can see of this scene is sent through Bound Up to
			<a href="https://openrouter.ai" rel="noreferrer" target="_blank">OpenRouter</a>, and on to the
			model provider. Anything your partner has hidden from you is left out.
		</li>
		<li>
			Bound Up doesn’t keep or log it on the way through, and only uses providers that say they
			don’t keep it or train on it. They are still other companies, and they do see the words.
		</li>
		<li>Nothing is sent unless you press a button that asks.</li>
	</ul>
	{#snippet footer()}
		<wa-button appearance="outlined" onclick={() => answer(false)}>Not now</wa-button>
		<wa-button variant="brand" appearance="accent" onclick={() => answer(true)}>
			I understand, ask it
		</wa-button>
	{/snippet}
</ResponsiveDialog>
