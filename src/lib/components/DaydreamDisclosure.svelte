<script lang="ts">
	import { enhance } from '$lib/enhance';
	import { invalidateAll } from '$lib/navigation';
	import { reportRequestFailure } from '$lib/request-failure.svelte';

	/**
	 * What a user is told, and has to accept, before their first daydream.
	 *
	 * Everything else they write in Bound Up stays private to them and the
	 * people they share it with. A daydream cannot: the character's replies are
	 * written by a language model, which has to read the daydream to write them.
	 * So this says plainly where the words go, before any do. Accepting is
	 * recorded on the server, which refuses to ask for a reply until it is.
	 *
	 * Deliberately says nothing about encryption or keys (AGENTS.md: no
	 * "unlock" copy), only who can read what.
	 */
	let {
		/** The accept action, resolved by the caller: it lives on the list page. */
		action
	}: { action: string } = $props();

	let busy = $state(false);
</script>

<wa-card class="disclosure" appearance="outlined">
	<h2>Before you start</h2>
	<p>
		A daydream is a story or a monologue made up for you, from an idea and the characters you choose. Their replies are written by an
		AI language model, which means it has to read the daydream.
	</p>
	<ul>
		<li>
			While you play, the character's setup and what you write are sent through Bound Up to
			<a href="https://openrouter.ai" rel="noreferrer" target="_blank">OpenRouter</a>, and on to the
			model provider that writes each reply. Links you put in a description of a daydream may be
			opened by OpenRouter, so it can read the pages for ideas.
		</li>
		<li>
			For a picture of a passage, a description of the moment goes through Bound Up to
			<a href="https://runware.ai" rel="noreferrer" target="_blank">Runware</a>, which makes it.
			The picture comes back through Bound Up and is kept encrypted, so only you can see it.
		</li>
		<li>
			Bound Up doesn't keep or log any of it on the way through, and only uses providers that say
			they don't keep it either or train on it. They are still other companies, and they do see the
			words.
		</li>
		<li>
			Your daydreams themselves are saved privately for you, like the rest of your account: no one
			else can read them, Bound Up included.
		</li>
	</ul>
	<form
		method="POST"
		{action}
		use:enhance={() => {
			busy = true;
			return async ({ result }) => {
				busy = false;
				if (result.type === 'error' || result.type === 'failure') {
					reportRequestFailure(result);
					return;
				}
				await invalidateAll();
			};
		}}
	>
		<wa-button type="submit" variant="brand" disabled={busy}>I understand</wa-button>
	</form>
</wa-card>

<style>
	.disclosure {
		h2 {
			margin-block-start: 0;
			font-size: 1.25rem;
		}

		ul {
			padding-inline-start: 1.25rem;
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}

		form {
			margin-block-start: 1rem;
			display: flex;
			justify-content: center;
		}
	}
</style>
