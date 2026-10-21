<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AuthBox from '$lib/components/AuthBox.svelte';
	import AuthPage from '$lib/components/AuthPage.svelte';
	import PartnerAcceptForm from '$lib/components/PartnerAcceptForm.svelte';
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import { openInviteLink, pinInviterFromInvite } from '$lib/partner-sealing';
	import { namesForViewer } from '$lib/partnership';
	import type { PartnershipInvite } from '$lib/sealed-kinds/partnerships';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// What a link preview says. It names nobody: the names are sealed under the
	// key in the link's fragment, which neither the server rendering this nor a
	// preview fetcher ever sees (docs/partners.md, "Names are sealed").
	const share = $derived(
		data.invite === null
			? {
					title: "This invite link doesn't work",
					description: 'It may have expired, already been used, or been cancelled.'
				}
			: {
					title: "You've been invited to Bound Up",
					description:
						"Open the link to see what they're proposing on Bound Up. You can still say no."
				}
	);

	/**
	 * The invite, opened with the key from the link — undefined while that runs
	 * (and on the server, which has no key), null when the link has no key or
	 * the wrong one.
	 */
	let opened = $state<{ invite: PartnershipInvite; key: Uint8Array<ArrayBuffer> } | null>();
	const sealedInvite = $derived(data.invite);
	const inviteId = $derived(data.invite?.partnershipId ?? null);
	$effect(() => {
		const invite = sealedInvite;
		// Keyed on the id, a primitive, so a reload of the same invite does not
		// open it again — see AGENTS.md on effects that read `data`.
		if (!(inviteId && invite)) {
			opened = null;
			return;
		}
		opened = undefined;
		void openInviteLink(invite, globalThis.location.hash)
			.catch(() => null)
			.then((result) => {
				opened = result;
			});
	});
	const inviterName = $derived(opened ? opened.invite.inviterName : '…');

	/** The page's title, one per state, in the order the markup tests them. */
	const title = $derived.by(() => {
		if (data.state === 'invalid') {
			return "This link doesn't work";
		}
		if (opened === null) {
			return 'This link is incomplete';
		}
		if (data.state === 'self') {
			return "That's your own link";
		}
		if (data.state === 'already-linked') {
			return "You're already linked";
		}
		return `${inviterName} wants to add you as a partner`;
	});

	/**
	 * Whether the inviter's key the server serves is the one inside the invite.
	 * Undefined until both are known; once it matches it is pinned as verified,
	 * since it reached this device from theirs without passing through the server.
	 */
	let inviterChecked = $state<boolean | undefined>();
	$effect(() => {
		const { user } = page.data;
		if (!(data.state === 'confirm' && opened && user)) {
			inviterChecked = undefined;
			return;
		}
		void pinInviterFromInvite({
			userId: user.id,
			partnershipId: data.invite.partnershipId,
			fromInvite: opened.invite.inviterRecipient,
			served: data.inviterRecipient
		})
			.catch(() => false)
			.then((matched) => {
				inviterChecked = matched;
			});
	});
</script>

<svelte:head>
	<title>{share.title} · Bound Up</title>
</svelte:head>
<ShareMeta {...share} />

<AuthPage {title} wide>
	<AuthBox>
		{#if data.state === 'invalid' || opened === null}
			<p>
				{#if data.state === 'invalid'}
					It may have expired, already been used, or been cancelled. Ask them to send a new one.
				{:else}
					Part of it seems to have been cut off. Ask them to send it again.
				{/if}
			</p>
			<!-- A way on rather than a dead end: someone who followed a dead invite
			     most likely still wants in. -->
			<wa-button href={resolve('/')} variant="brand" appearance="accent">Go to Bound Up</wa-button>
			{#if !page.data.user}
				<a class="secondary" href={resolve('/(public)/login')}>Log in</a>
			{/if}
		{:else if data.state === 'sign-in-required'}
			<p>Log in or create an account to see what they're proposing. You can still say no.</p>
			<!-- "Create an account" is primary on purpose: someone reaching an invite
			     link while logged out most likely does not have an account yet, so
			     that is the more probable action — and more probable actions get the
			     solid button. "Log in to accept" rather than plain "Log in", because
			     it says what happens next: the invite is waiting on the other side. -->
			<div class="actions">
				<wa-button
					variant="brand"
					appearance="outlined"
					href={`${resolve('/login')}?redirectTo=${encodeURIComponent(data.redirectTo)}`}
				>
					Log in to accept
				</wa-button>
				<wa-button
					variant="brand"
					appearance="accent"
					href={`${resolve('/signup')}?redirectTo=${encodeURIComponent(data.redirectTo)}`}
				>
					Create an account
				</wa-button>
			</div>
		{:else if data.state === 'self'}
			<p>Send it to the person you want to link with.</p>
			<a href={resolve('/(auth-required)/(app)/settings/partners')}>Back to partners</a>
		{:else if data.state === 'already-linked'}
			<p>You and {inviterName} are already partners.</p>
			<a href={resolve('/(auth-required)/(app)/settings/partners')}>Back to partners</a>
		{:else if data.state === 'confirm'}
			{#if opened && inviterChecked === false}
				<!-- The key the server serves for them is not the one their own device
				     put in the link. Going on would link to whoever made that swap. -->
				<p class="warning" role="alert">
					Something about this invite doesn't match what we have for {inviterName}, so it can't be
					accepted here. Ask them to send you a new link, and let us know if it happens again.
				</p>
			{:else if opened && inviterChecked && data.inviterRecipient}
				<p>
					{#if data.editable}
						Check these over — you can change them — then accept.
					{:else}
						If you accept, they'll be able to set tasks, rewards and punishments for you.
					{/if}
				</p>

				<PartnerAcceptForm
					data={data.partnerAcceptForm}
					editable={data.editable}
					names={namesForViewer(opened.invite, 'invitee')}
					invite={{
						partnershipId: data.invite.partnershipId,
						key: opened.key,
						inviterRecipient: opened.invite.inviterRecipient
					}}
				>
					<a class="decline" href={resolve('/')}>Not now</a>
				</PartnerAcceptForm>
			{:else}
				<p>…</p>
			{/if}
		{/if}
	</AuthBox>
</AuthPage>

<style>
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;

		wa-button {
			flex: 1 1 10rem;
		}
	}

	.secondary,
	.decline {
		align-self: center;
		color: var(--wa-color-text-quiet);
	}

	.warning {
		color: var(--wa-color-text-danger);
	}
</style>
