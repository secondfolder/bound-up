<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import NotificationSettings from '$lib/components/NotificationSettings.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = resolve('/(auth-required)/(app)/settings');
</script>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to settings"
		backText="Settings"
		title="Notifications"
		description="Hear about new messages without opening the app."
	/>

	<div class="content">
		<NotificationSettings
			vapidPublicKey={data.vapidPublicKey}
			devices={data.devices}
			onchange={() => invalidate('app:push-devices')}
		/>
		<p class="privacy">
			Notifications say who and what, never what was said: "New message from" and your partner's
			name.
		</p>
	</div>
</section>

<style>
	section {
		max-width: 40rem;
		margin: 0 auto;
		width: 100%;
		padding-bottom: var(--wa-space-l);

		.content {
			display: flex;
			flex-direction: column;
			gap: var(--wa-space-m);
			padding: var(--wa-space-l);
		}

		.privacy {
			margin: 0;
			color: var(--wa-color-text-quiet);
			font-size: var(--wa-font-size-s);
		}
	}
</style>
