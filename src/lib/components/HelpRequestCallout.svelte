<script lang="ts">
	import { resolve } from '$app/paths';
	import type { HelpRequestView } from '$lib/types';

	/**
	 * "{name} can't sign in and asked for your help", on every screen.
	 *
	 * In the app shell because a partner who cannot get into their account has
	 * no way to message you about it — so the request has to find you wherever
	 * you are. It only links to the messages board, where the code is compared
	 * and the request answered (`RestoreRequests.svelte`); nothing is decided
	 * from here. See docs/account-recovery.md.
	 */
	let { requests }: { requests: HelpRequestView[] } = $props();
</script>

{#each requests as request (request.partnershipId)}
	<wa-callout variant="warning" class="help" data-testid="help-request">
		<wa-icon slot="icon" name="life-ring" variant="solid"></wa-icon>
		<strong>{request.partnerName} can't sign in and asked for your help</strong>
		<p>
			<a
				href={resolve('/(auth-required)/(app)/partner/[id]/messages', {
					id: request.partnershipId
				})}
			>
				Help {request.partnerName} sign in
			</a>
		</p>
	</wa-callout>
{/each}

<style>
	.help {
		display: block;
		max-width: 40rem;
		margin: var(--wa-space-m) auto;
		width: calc(100% - 2 * var(--wa-space-m));

		strong {
			display: block;
		}

		p {
			margin: 0.25rem 0 0;
		}
	}
</style>
