<script lang="ts">
	import type { TrustView } from '$lib/crypto/trust.svelte';
	import SafetyNumber from './SafetyNumber.svelte';

	/**
	 * Everything this device has to say about the two keys in a partnership.
	 *
	 * One component for all six states rather than a callout per case in each
	 * page, because the board and the thread view both need the identical thing
	 * and a second copy would drift — and because the states are mutually
	 * exclusive, so which one shows is a single decision.
	 *
	 * The states, and why each reads the way it does:
	 *
	 * - `new` — first sight on this device. Sending is allowed, because that is
	 *   what trust-on-first-use means, but it says *when* it was first seen so
	 *   "a moment ago" is not mistaken for "two years ago". Pins are per-device
	 *   until `sealed_pins` exists, so a new phone lands here legitimately.
	 * - `pinned` — matches, never compared out of band. A quiet offer, not a nag.
	 * - `verified` — matches and was compared. A small, permanent reassurance.
	 * - `changed` (partner) — blocked. The one state that stops a send.
	 * - `changed` (own) — the server returned a different key for *you*.
	 * - `changed` (vault) — the key the partnership's shared data is locked
	 *   with is not the one this device first saw. Nothing legitimate replaces
	 *   it, so the only way past is comparing the safety number, which covers it.
	 */
	let {
		trust,
		partnerName,
		verify,
		accept,
		alertsOnly = false
	}: {
		trust: TrustView;
		partnerName: string;
		verify: () => Promise<void>;
		accept: (which: 'partner' | 'own' | 'vault') => Promise<void>;
		/**
		 * Only a changed key, which stops a send and must be seen wherever it
		 * can be: for a board showing several partnerships at once (Everyone),
		 * where a quiet line and a "Check your safety number" per partner
		 * would stack up above the threads. Each partnership's own board and
		 * its threads still say the rest.
		 */
		alertsOnly?: boolean;
	} = $props();

	let showNumber = $state(false);
	let working = $state(false);

	async function run(action: () => Promise<void>) {
		working = true;
		try {
			await action();
		} finally {
			working = false;
		}
	}

	/** Absolute, not relative: "first seen 3 days ago" invites a shrug; a date is checkable. */
	function when(stamp: number): string {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(stamp));
	}
</script>

{#if trust.status === 'unavailable' && !alertsOnly}
	<wa-callout variant="neutral" size="small">
		<wa-icon slot="icon" name="triangle-exclamation" variant="solid"></wa-icon>
		This browser will not remember which keys it has seen, so it cannot warn you if
		{partnerName}'s key changes. Messages are still encrypted.
	</wa-callout>
{:else if trust.status === 'known'}
	{#if trust.own.kind === 'changed'}
		<!--
			Listed before the partner's, and worded differently, because it means
			something worse: the server returned a different public key for the
			user's own account than this device recorded. The innocent cause is
			getting back in with a partner's help, which replaces the identity — so
			that is named, since otherwise this reads as an accusation the user
			cannot act on.
		-->
		<wa-callout variant="danger">
			<wa-icon slot="icon" name="triangle-exclamation" variant="solid"></wa-icon>
			<strong>Your own message key has changed</strong>
			<p>
				This device recorded a different key for your account. That is expected if a partner helped
				you sign back in — it replaces your keys. If that did not happen, do not send anything:
				someone may have changed them for you.
			</p>
			<wa-button
				size="s"
				variant="danger"
				disabled={working}
				onclick={() => run(() => accept('own'))}
			>
				A partner helped me sign in — use the new key
			</wa-button>
		</wa-callout>
	{:else if trust.partner.kind === 'changed'}
		<wa-callout variant="danger">
			<wa-icon slot="icon" name="triangle-exclamation" variant="solid"></wa-icon>
			<strong>{partnerName}'s message key has changed</strong>
			<p>
				This device first saw a different key on {when(trust.partner.pinned.pinnedAt)}. That happens
				when a partner helps them sign back in after losing every way in — but it is also what it
				would look like if someone were trying to read your messages.
			</p>
			<!--
				Said explicitly because "key changed" otherwise reads as "your history
				is gone", which would make the safe action look expensive.
			-->
			<p>
				Everything they have already sent you stays readable — you decrypt that with your own key,
				not theirs. Only new messages are held back.
			</p>
			<SafetyNumber value={trust.safetyNumber} {partnerName} tone="warning" />
			<wa-button
				size="s"
				variant="danger"
				disabled={working}
				onclick={() => run(() => accept('partner'))}
			>
				I checked with {partnerName} — this is their new key
			</wa-button>
		</wa-callout>
	{:else if trust.vault?.kind === 'changed'}
		<!--
			No innocent cause to name, unlike the two above: a partner-assisted
			sign-in re-wraps the shared key, it never makes a new one. So the copy
			says so plainly and the only way on is the safety number, which covers
			this key as well as both of yours.
		-->
		<wa-callout variant="danger">
			<wa-icon slot="icon" name="triangle-exclamation" variant="solid"></wa-icon>
			<strong>The key for everything you share with {partnerName} has changed</strong>
			<p>
				This device first saw a different one on {when(trust.vault.pinned.pinnedAt)}. That should
				never happen on its own, and it is what it would look like if someone were trying to read
				what you share. Nothing new is saved until you have checked.
			</p>
			<p>
				Read this number to {partnerName} somewhere other than this app. Only if theirs matches,
				carry on.
			</p>
			<SafetyNumber value={trust.safetyNumber} {partnerName} tone="warning" />
			<wa-button
				size="s"
				variant="danger"
				disabled={working}
				onclick={() => run(() => accept('vault'))}
			>
				Our numbers match — carry on
			</wa-button>
		</wa-callout>
	{:else if !alertsOnly}
		<div class="quiet">
			{#if trust.partner.kind === 'verified'}
				<p class="line">
					<!-- circle-check, not shield-check: the latter is Font Awesome Pro, and a
					     missing icon fails silently as an empty box. -->
					<wa-icon name="circle-check" variant="solid"></wa-icon>
					You checked {partnerName}'s key on {when(trust.partner.verifiedAt)}.
				</p>
			{:else if trust.partner.kind === 'new'}
				<p class="line">
					<wa-icon name="circle-info" variant="solid"></wa-icon>
					This device is seeing {partnerName}'s key for the first time.
				</p>
			{/if}

			{#if trust.partner.kind !== 'verified'}
				{#if showNumber}
					<SafetyNumber value={trust.safetyNumber} {partnerName} />
					<div class="actions">
						<wa-button size="s" disabled={working} onclick={() => run(verify)}>
							It matches
						</wa-button>
						<wa-button size="s" appearance="plain" onclick={() => { showNumber = false; }}>
							Not now
						</wa-button>
					</div>
				{:else}
					<!-- In the link colour with an icon: as a plain button it was quiet
					     grey text that did not look like it did anything, the first
					     line on the board. -->
					<wa-button
						class="check"
						size="s"
						appearance="plain"
						onclick={() => { showNumber = true; }}
					>
						<wa-icon slot="start" name="shield-halved" variant="solid"></wa-icon>
						Check your safety number
					</wa-button>
				{/if}
			{/if}
		</div>
	{/if}
{/if}

<style>
	.quiet {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);

		.line {
			margin: 0;
			display: flex;
			align-items: center;
			gap: 0.375rem;
		}

		.actions {
			display: flex;
			gap: 0.5rem;
		}

		/* Flush with the text above it and the board's gutter, rather than
		   indented by a button's padding. */
		wa-button.check {
			--wa-form-control-padding-inline: 0;

			&::part(base) {
				color: var(--wa-color-text-link);
			}
		}
	}

	wa-callout {
		display: block;

		strong {
			display: block;
		}

		p {
			margin: 0.25rem 0 0.5rem;
			font-size: 0.875rem;
		}
	}
</style>
