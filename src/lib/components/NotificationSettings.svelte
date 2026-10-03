<script lang="ts">
	import { onMount } from 'svelte';
	import {
		disablePush,
		enablePush,
		type PushSupport,
		pushSupport,
		resyncPush,
		storedPushDeviceId
	} from '$lib/push-client';
	import { NETWORK_FAILURE, tryFetch } from '$lib/request-failure.svelte';
	import ShareGlyph from './ShareGlyph.svelte';

	/**
	 * Push notification settings: this device's switch, and every device's
	 * categories.
	 *
	 * What a browser can do is only knowable in the browser, so it is worked out
	 * in `onMount` and a placeholder shows until then, never a guess that
	 * hydration would take back. See docs/notifications.md.
	 */

	type Device = {
		id: string;
		label: string;
		notifyMessages: boolean;
		notifyReactions: boolean;
	};

	let {
		vapidPublicKey,
		devices,
		onchange
	}: {
		/** Null when this server has no VAPID keys, so push is off here. */
		vapidPublicKey: string | null;
		devices: Device[];
		/** Called after anything changes, to reload `devices`. */
		onchange: () => Promise<void> | void;
	} = $props();

	let support = $state<PushSupport | 'checking'>('checking');
	let thisDeviceId = $state<string | null>(null);
	let busy = $state(false);
	let message = $state<string | null>(null);

	const subscribedHere = $derived(
		thisDeviceId !== null && devices.some((device) => device.id === thisDeviceId)
	);

	onMount(() => {
		support = pushSupport();
		thisDeviceId = storedPushDeviceId();
		// A browser can be subscribed while the server has forgotten it, or the
		// other way round (another account used it, storage was cleared). Re-
		// registering is an idempotent upsert, so it simply puts them back in step.
		if (support === 'available' && vapidPublicKey) {
			void resyncPush()
				.then(async (id) => {
					const known = id !== null && devices.some((device) => device.id === id);
					thisDeviceId = id;
					if (id !== null && !known) {
						await onchange();
					}
				})
				.catch(() => {
					// Leaves the switch showing "off", which is true enough to act on.
				});
		}
	});

	async function turnOn() {
		if (!vapidPublicKey) {
			return;
		}
		busy = true;
		message = null;
		try {
			thisDeviceId = await enablePush(vapidPublicKey);
			if (thisDeviceId === null) {
				support = pushSupport();
			}
			await onchange();
		} catch {
			message = 'Could not turn on notifications. Please try again.';
		} finally {
			busy = false;
		}
	}

	async function turnOff() {
		busy = true;
		message = null;
		if (!(await disablePush())) {
			message = 'This browser has stopped, but the server could not be told. Remove it below.';
		}
		thisDeviceId = null;
		await onchange();
		busy = false;
	}

	async function update(id: string, changes: Partial<Omit<Device, 'id' | 'label'>>) {
		message = null;
		const response = await tryFetch(`/api/push/subscriptions/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(changes)
		});
		if (!response?.ok) {
			message = response ? 'Could not save that change. Please try again.' : NETWORK_FAILURE;
		}
		await onchange();
	}

	async function remove(id: string) {
		if (id === thisDeviceId) {
			await turnOff();
			return;
		}
		message = null;
		const response = await tryFetch(`/api/push/subscriptions/${encodeURIComponent(id)}`, {
			method: 'DELETE'
		});
		if (!response?.ok) {
			message = response ? 'Could not remove that device. Please try again.' : NETWORK_FAILURE;
		}
		await onchange();
	}

	function checked(event: Event): boolean {
		return (event.currentTarget as HTMLInputElement).checked;
	}
</script>

<div class="notifications" data-support={support}>
	{#if !vapidPublicKey}
		<wa-callout variant="neutral" data-testid="push-unconfigured">
			Notifications are not set up on this server.
		</wa-callout>
	{:else if support === 'checking'}
		<wa-skeleton effect="sheen"></wa-skeleton>
	{:else if support === 'needs-install'}
		<wa-callout variant="neutral" data-testid="push-needs-install">
			<strong>Add Bound Up to your Home Screen first</strong>
			<p>
				Your iPhone or iPad only shows notifications from apps on the Home Screen. Tap <ShareGlyph
				/>, then “Add to Home Screen”, and open Bound Up from there.
			</p>
		</wa-callout>
	{:else if support === 'unsupported'}
		<wa-callout variant="neutral" data-testid="push-unsupported">
			This browser cannot show notifications.
		</wa-callout>
	{:else if support === 'denied'}
		<wa-callout variant="warning" data-testid="push-denied">
			Notifications are blocked for Bound Up. Allow them in your device or browser settings, then
			come back here.
		</wa-callout>
	{:else if !subscribedHere}
		<p>Get a notification when your partner sends you a message.</p>
		<!-- `disabled={busy}`, never `busy || undefined` — see AGENTS.md. -->
		<wa-button variant="brand" onclick={turnOn} disabled={busy} data-testid="push-turn-on">
			Turn on notifications
		</wa-button>
	{/if}

	{#if vapidPublicKey && devices.length > 0}
		<ul class="devices">
			{#each devices as device (device.id)}
				<li data-testid="push-device">
					<div class="heading">
						<span class="label">
							{device.label}
							{#if device.id === thisDeviceId}<small>This device</small>{/if}
						</span>
						<wa-button appearance="plain" size="s" onclick={() => remove(device.id)}>
							{device.id === thisDeviceId ? 'Turn off' : 'Remove'}
						</wa-button>
					</div>
					<wa-switch
						checked={device.notifyMessages}
						onchange={(event: Event) => update(device.id, { notifyMessages: checked(event) })}
						>Messages</wa-switch
					>
					<wa-switch
						checked={device.notifyReactions}
						onchange={(event: Event) => update(device.id, { notifyReactions: checked(event) })}
						>Reactions to your messages</wa-switch
					>
				</li>
			{/each}
		</ul>
	{/if}

	{#if message}<p class="invalid">{message}</p>{/if}
</div>

<style>
	.notifications {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);

		p {
			margin: 0;
		}

		wa-callout p {
			margin-top: 0.25rem;
			color: var(--wa-color-text-quiet);
		}

		.devices {
			list-style: none;
			padding: 0;
			margin: 0;

			li {
				display: flex;
				flex-direction: column;
				gap: var(--wa-space-s);
				padding: var(--wa-space-m) 0;
				border-bottom: 1px solid var(--wa-color-surface-border);
			}

			.heading {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: var(--wa-space-s);
			}

			.label {
				display: flex;
				flex-direction: column;
			}

			small {
				color: var(--wa-color-text-quiet);
			}
		}

		.invalid {
			color: var(--wa-color-text-danger);
		}
	}
</style>
