<script lang="ts">
	import { resolve } from '$app/paths';
	import SpaceColourForm from '$lib/components/context/SpaceColourForm.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SealedPartnerEditForm from '$lib/components/SealedPartnerEditForm.svelte';
	import { inviteFragment } from '$lib/crypto/invite';
	import { enhance } from '$lib/enhance';
	import { initialsFor } from '$lib/initials';
	import { openedNames, partnerName, viewerNames } from '$lib/partner-names.svelte';
	import { inviterInviteKey, sealInvite } from '$lib/partner-sealing';
	import type { ViewerNames } from '$lib/partnership';
	import { reportRequestFailure } from '$lib/request-failure.svelte';
	import { shareInviteLink } from '$lib/share';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const partnership = $derived(data.partnership);
	const backHref = resolve('/(auth-required)/(app)/settings/partners');
	/** The names, opened in the browser (`partner-names.svelte.ts`); placeholders until then. */
	const shownName = $derived(partnerName(partnership.names));
	const opened = $derived(viewerNames(partnership.names));
	/**
	 * The names as first opened, so the edit form is mounted once with them in
	 * it, rather than torn down when a save's reload briefly reads as "opening".
	 */
	let formNames = $state<ViewerNames | null | undefined>(undefined);
	$effect(() => {
		if (formNames === undefined && opened !== undefined) {
			formNames = opened;
		}
	});

	/**
	 * The link with its key. The server sends the inviter the link without one
	 * — it never has the key — and the key comes back from the inviter's own
	 * wrap of it. An invite from before names were sealed has no key, and so no
	 * working link until a new one is made.
	 */
	let inviteLink = $state<string | null>(null);
	const keyWrap = $derived(partnership.names.invite?.keyWrap ?? null);
	$effect(() => {
		const base = data.inviteUrl;
		const wrap = keyWrap;
		const { id } = partnership;
		if (!(base && wrap)) {
			inviteLink = null;
			return;
		}
		void inviterInviteKey(id, wrap).then((key) => {
			inviteLink = key ? `${base}${inviteFragment(key)}` : null;
		});
	});

	/**
	 * Who is what, in a sentence, beside their avatar. It used to be the
	 * header's description as "Mistress / pet", which did not say whose role
	 * was which.
	 */
	const roleLine = $derived.by(() => {
		const parts = [
			opened?.partnerRole ? `They're your ${opened.partnerRole}` : null,
			opened?.yourRole
				? `${opened?.partnerRole ? "you're" : "You're"} their ${opened.yourRole}`
				: null
		].filter(Boolean);
		return parts.length > 0 ? parts.join(' · ') : null;
	});

	let shareStatus: string | null = $state(null);
	/** The share button shows a check for a moment once the link has gone. */
	let shareDone = $state(false);
	$effect(() => {
		if (!shareDone) {
			return;
		}
		const timer = setTimeout(() => {
			shareDone = false;
		}, 1500);
		return () => clearTimeout(timer);
	});
	let rotateError: string | null = $state(null);

	async function share(url: string) {
		const outcome = await shareInviteLink(url);
		if (outcome.shared) {
			shareStatus = 'Shared.';
			shareDone = true;
		} else if (outcome.copied) {
			shareStatus = 'Link copied to your clipboard.';
			shareDone = true;
		} else {
			shareStatus = 'Could not copy automatically — select the link above.';
		}
	}
</script>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to partners"
		backText="Partners"
		title={shownName}
	/>

	<div class="content">
		<!-- Left-aligned with everything else. Centred on its own under a
		     left-aligned title, it floated in the middle of the column. -->
		<div class="identity">
			<wa-avatar
				image={partnership.counterpartImage ?? undefined}
				initials={initialsFor(shownName)}
				label={shownName}
			></wa-avatar>
			{#if roleLine}<p>{roleLine}</p>{/if}
		</div>

		{#if partnership.status === 'pending'}
			<div class="pending">
				<h2>Waiting for them to accept</h2>

				{#if data.inviteUrl && inviteLink}
					<p>Send them this link. It stops working once they accept it.</p>
					<!-- readonly rather than disabled so the value can still be selected
				     and copied by hand when the Clipboard API is unavailable. -->
					<input
						class="link"
						type="text"
						readonly
						value={inviteLink}
						aria-label="Invite link"
					/>
					<wa-button onclick={() => inviteLink && share(inviteLink)}>
						{#key shareDone}
							<wa-icon
								slot="start"
								class:done={shareDone}
								name={shareDone ? 'check' : 'share-nodes'}
								variant="solid"
							></wa-icon>
						{/key}
						Share link again
					</wa-button>
					{#if shareStatus}<p class="status">{shareStatus}</p>{/if}
				{:else if data.inviteExpired}
					<p class="invalid">This invite link has expired.</p>
				{:else if data.inviteUrl && !keyWrap}
					<p>This link is from an older version of Bound Up. Create a new link to send them.</p>
				{:else if data.inviteUrl}
					<p class="hint">…</p>
				{:else}
					<p>Only the person who created this invite can see the link.</p>
				{/if}

				{#if partnership.role === 'inviter'}
					<form
						method="POST"
						action="?/rotate"
						use:enhance={async ({ formData, cancel }) => {
							rotateError = null;
							// A new link gets a new invite key: the invite is sealed again
							// under it, from the names as they stand.
							const stored = openedNames(partnership.names);
							const sealed = stored ? await sealInvite(partnership.id, stored) : null;
							if (!sealed?.ok) {
								rotateError = sealed?.error ?? 'Could not renew the link. Reload and try again.';
								cancel();
								return;
							}
							for (const [name, value] of Object.entries(sealed.fields)) {
								formData.set(name, value);
							}
							return async ({ result, update }) => {
								if (result.type === 'success' && typeof result.data?.url === 'string') {
									await share(`${result.data.url}${inviteFragment(sealed.key)}`);
								} else if (result.type === 'failure') {
									rotateError = String(result.data?.rotateError ?? 'Could not renew the link.');
								} else if (result.type === 'error') {
									// Shown on this page rather than swapping it for the error page.
									reportRequestFailure(result);
									return;
								}
								// Refresh the load data so the input above shows the new link.
								await update({ reset: false });
							};
						}}
					>
						<wa-button type="submit" appearance="outlined">Create a new link</wa-button>
					</form>
					<p class="hint">Creating a new link stops the old one from working.</p>
					{#if rotateError}<p class="invalid">{rotateError}</p>{/if}
				{/if}
			</div>
		{/if}

		{#if partnership.status === 'accepted' || partnership.canEdit}
			<h2>Settings</h2>
			{#if partnership.canEdit}
				{#if formNames}
					<SealedPartnerEditForm
						partnerEditForm={data.partnerEditForm}
						{partnership}
						names={formNames}
					/>
				{:else if formNames === null}
					<p class="hint">These can't be shown on this device right now.</p>
				{:else}
					<p class="hint">…</p>
				{/if}
			{:else}
				<dl class="readonly">
					<dt>What you call them</dt>
					<dd>{shownName}</dd>
					<dt>What they call you</dt>
					<dd>{opened?.yourName ?? '…'}</dd>
				</dl>
				<p class="hint">They're in control of this link, so only they can change these.</p>
			{/if}
		{/if}

		{#if data.colourForm}
			<h2>Colour</h2>
			<SpaceColourForm form={data.colourForm} partnerName={shownName} />
		{/if}

		<!-- Set apart from the settings above, with what it does said before
		     the button rather than only in the confirm. -->
		<div class="leave">
			<p class="hint">
				{partnership.status === 'pending'
					? 'Cancelling stops the invite link from working.'
					: 'Ends the link for both of you. This cannot be undone.'}
			</p>

			<!-- Always available, whoever holds control: see the disconnect action. -->
			<form
				method="POST"
				action="?/disconnect"
				use:enhance={({ cancel }) => {
					// biome-ignore lint/suspicious/noAlert: the native confirm is the whole confirmation step today; a styled dialog would be a UI change of its own.
					if (!confirm(`Disconnect from ${shownName}? This cannot be undone.`)) {
						cancel();
					}
					return async ({ result, update }) => {
						if (result.type === 'error') {
							reportRequestFailure(result);
							return;
						}
						await update();
					};
				}}
			>
				<wa-button type="submit" appearance="outlined" variant="danger">
					{partnership.status === 'pending' ? 'Cancel invite' : 'Disconnect'}
				</wa-button>
			</form>
		</div>
	</div>
</section>

<style>
	section {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		width: 100%;

		.content {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			padding: var(--wa-space-l) var(--page-gutter);
		}

		.identity {
			display: flex;
			align-items: center;
			gap: 0.75rem;

			wa-avatar {
				--size: 3rem;
				flex: none;
			}

			p {
				margin: 0;
				color: var(--wa-color-text-quiet);
			}
		}

		/* The size every settings subsection heading uses. */
		h2 {
			font-size: var(--wa-font-size-l);
			margin: 0;
		}

		.pending {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			border-color: var(--wa-color-surface-border);
			border-radius: var(--wa-panel-border-radius);
			border-style: var(--wa-panel-border-style);
			border-width: var(--wa-panel-border-width);
			padding: var(--wa-space-l);

			p {
				margin: 0;
				color: var(--wa-color-text-quiet);
			}

			.link {
				width: 100%;
				box-sizing: border-box;
				font-family: monospace;
				font-size: 0.8rem;
				padding: 0.5rem;
			}
		}

		form {
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}

		.leave {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 0.75rem;
			margin-top: var(--wa-space-s);
			padding-top: var(--wa-space-l);
			border-top: 1px solid var(--wa-color-surface-border);

			/* The form contributes only its button. */
			form {
				display: contents;
			}
		}

		/* The share icon pops as it turns into a check. */
		@media (prefers-reduced-motion: no-preference) {
			wa-icon.done {
				animation: share-done 0.4s ease-out;
			}
		}

		.readonly {
			margin: 0;

			dt {
				color: var(--wa-color-text-quiet);
				font-size: 0.875em;
			}

			dd {
				margin: 0 0 0.75rem;
				font-weight: var(--wa-font-weight-semibold, 600);
			}
		}

		.hint,
		.status {
			margin: 0;
			color: var(--wa-color-text-quiet);
			font-size: 0.875em;
		}

		.invalid {
			color: var(--wa-color-text-danger);
		}
	}

	@keyframes share-done {
		0% {
			scale: 0.4;
		}
		60% {
			scale: 1.25;
		}
		100% {
			scale: 1;
		}
	}
</style>
