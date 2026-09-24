<script lang="ts">
	import { invalidate, invalidateAll } from '$app/navigation';
	import { recoveryCode } from '$lib/crypto/fingerprint';
	import { trustRecoveredKey } from '$lib/crypto/trust.svelte';
	import {
		declineHistoryRestore,
		type RestoreProgress,
		runHistoryRestore
	} from '$lib/messaging/restore';
	import type { RestoreRequestView } from '$lib/types';
	import SafetyNumber from './SafetyNumber.svelte';

	/**
	 * Partner-assisted sign-in, as the partners see it on the messages board.
	 *
	 * Someone who lost every way into their account asked for help from the
	 * login page (`/login/recover`). Their browser made a new key, and each of
	 * their partners gets a request here to re-encrypt the shared history to it.
	 * The first partner to finish is what lets them back in. See
	 * docs/account-recovery.md.
	 *
	 * Two ends of the same thing share this component:
	 *
	 * - **Mine** — I am back in, and a partner has not yet brought back our older
	 *   messages. Nothing to do but be told.
	 * - **Theirs** — my partner is asking. This is the consequential one.
	 *
	 * The out-of-band comparison is **load-bearing, not a nicety**, and the copy
	 * has to carry that weight. Without it a dishonest server — or, until email
	 * verification exists, anyone who knows the partner's email — could inject a
	 * request carrying their own key and have this partner re-encrypt the whole
	 * history straight to it, and let them into the account besides. So: the code
	 * is shown before the button, the button says what it means, and declining is
	 * offered as an equal option rather than buried.
	 */
	let {
		requests,
		partnershipId,
		partnerName,
		userId
	}: {
		requests: RestoreRequestView[];
		partnershipId: string;
		partnerName: string;
		/** The viewer, for pinning the key they are about to vouch for. */
		userId: string;
	} = $props();

	/**
	 * The code is derived from the recipient **snapshotted on the request**,
	 * never from whatever `user_keys` currently says.
	 *
	 * This is the point of the whole screen. `applyHistoryRestore` seals to the
	 * snapshot, so the code the partner compares has to describe the same value —
	 * computing it from the served key would let a server show a matching code
	 * and receive the history under a different one. The requester's page
	 * computes the same code from the key their browser made.
	 */
	const codes = $derived.by(async () => {
		// A plain object rather than a Map, and deliberately not a SvelteMap: this
		// is a scratch lookup built fresh inside the derivation and never mutated
		// afterwards, so there is nothing for reactivity to observe.
		const entries: Record<string, string> = {};
		for (const request of requests) {
			entries[request.id] = await recoveryCode(request.requestedRecipient);
		}
		return entries;
	});

	type Busy = { id: string; progress: RestoreProgress | null };
	let busy: Busy | null = $state(null);

	/** The confirm button's text: its own progress, or the question it asks. */
	function restoreLabel(requestId: string): string {
		if (busy?.id !== requestId) {
			return 'The code matches — help them';
		}
		return busy.progress ? `Working… ${busy.progress.done} done` : 'Working…';
	}
	let failure: string | null = $state(null);

	async function restore(request: RestoreRequestView) {
		failure = null;
		busy = { id: request.id, progress: null };
		try {
			const outcome = await runHistoryRestore(
				partnershipId,
				{ id: request.id, requestedRecipient: request.requestedRecipient },
				(progress) => {
					// Rebuilt rather than mutated: `busy` is the $state reference and
					// reassigning the object is what makes the label update.
					if (busy) {
						busy = { id: request.id, progress };
					}
				}
			);
			if (outcome.ok) {
				// They just compared the code, which vouches for the new key as much
				// as comparing a safety number would.
				await trustRecoveredKey(userId, partnershipId, request.requestedRecipient);
			} else {
				failure = outcome.message;
			}
		} finally {
			busy = null;
			// All, not only the board: the app shell's "asked for your help"
			// callout is from the layout load, and should go with the request.
			await invalidateAll();
		}
	}

	async function decline(request: RestoreRequestView) {
		failure = null;
		busy = { id: request.id, progress: null };
		try {
			if (!(await declineHistoryRestore(partnershipId, request.id))) {
				failure = 'That request could not be declined — reload and try again.';
			}
		} finally {
			busy = null;
			await invalidate(`messages:board:${partnershipId}`);
			await invalidateAll();
		}
	}
</script>

{#each requests as request (request.id)}
	{#if request.mine}
		<wa-callout variant="neutral" size="small">
			<wa-icon slot="icon" name="clock-rotate-left" variant="solid"></wa-icon>
			<strong>Some older messages are still on their way</strong>
			<p>
				{partnerName} needs to open Bound Up and confirm it is you before your older messages with them
				come back.
			</p>
		</wa-callout>
	{:else}
		<wa-callout variant="warning" data-testid="restore-request">
			<wa-icon slot="icon" name="life-ring" variant="solid"></wa-icon>
			{#if request.signInApproved}
				<strong>{partnerName} needs your help to get your messages back</strong>
				<p>
					They lost every way into their account and have signed back in with another partner's help.
					Your messages with them are still unreadable to them until you confirm it is really them.
				</p>
			{:else}
				<strong>{partnerName} can't sign in and asked for your help</strong>
				<p>
					They lost every way into their account. Confirming lets them back in, and brings back the
					messages the two of you have sent.
				</p>
			{/if}
			<!--
				Blunt on purpose. This is the one step that stands between someone
				pretending to be them and both the account and the conversation.
			-->
			<p>
				<strong>Check with them first.</strong> Ask {partnerName} to read you the code on their screen.
				If it does not match this one, someone else is asking — and confirming would hand them
				everything.
			</p>
			{#await codes then resolved}
				{const code = $derived(resolved[request.id])}
				{#if code}
					<SafetyNumber
						value={code}
						{partnerName}
						tone="warning"
						instructions={`Compare this with the code on ${partnerName}'s screen, in person or over a call — not in this app.`}
					/>
				{/if}
			{/await}

			<div class="actions">
				<!-- disabled={busy !== null}, never `|| undefined` — invariant 11. -->
				<wa-button
					size="s"
					variant="brand"
					disabled={busy !== null}
					onclick={() => restore(request)}
				>
					{restoreLabel(request.id)}
				</wa-button>
				<wa-button
					size="s"
					appearance="outlined"
					disabled={busy !== null}
					onclick={() => decline(request)}
				>
					It doesn't match
				</wa-button>
			</div>
		</wa-callout>
	{/if}
{/each}

{#if failure}
	<wa-callout variant="danger" size="small">{failure}</wa-callout>
{/if}

<style>
	wa-callout {
		display: block;

		strong {
			display: block;
		}

		p {
			margin: 0.25rem 0 0.5rem;
			font-size: 0.875rem;

			strong {
				display: inline;
			}
		}

		.actions {
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem;
		}
	}
</style>
