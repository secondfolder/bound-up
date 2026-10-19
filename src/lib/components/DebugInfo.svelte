<script lang="ts">
	import { onMount } from 'svelte';
	import { currentKeyring } from '$lib/crypto/session.svelte';
	import type { FeatureKey } from '$lib/features';
	import { isStandalone } from '$lib/home-screen';
	import { pushSupport, storedPushDeviceId } from '$lib/push-client';

	/**
	 * What someone helping fix a problem asks first, on one screen, shown on
	 * /settings while debug mode is on (docs/debug-mode.md). Copy puts it all
	 * on the clipboard as plain text, for pasting into a bug report.
	 *
	 * Nothing here is secret: no key, no credential, nothing sealed. The
	 * keyring is named by its status alone, and the push device id is the
	 * server's own id for this browser, not its subscription.
	 */
	let {
		version,
		userId,
		accountTimezone,
		features
	}: {
		version: string;
		userId: string;
		accountTimezone: string;
		features: readonly FeatureKey[];
	} = $props();

	type Line = { label: string; value: string };

	/** What only the browser knows, filled in once mounted; null during SSR. */
	let device = $state<Line[] | null>(null);
	let copied = $state<'idle' | 'copied' | 'failed'>('idle');

	const keyringStatus = $derived(currentKeyring().status);

	onMount(() => {
		const viewport = globalThis.visualViewport;
		device = [
			{ label: 'Device timezone', value: Intl.DateTimeFormat().resolvedOptions().timeZone },
			{ label: 'Push support', value: pushSupport() },
			{ label: 'Push device id', value: storedPushDeviceId() ?? 'none' },
			{
				label: 'Service worker',
				value: navigator.serviceWorker?.controller ? 'controlling' : 'not controlling'
			},
			{ label: 'Display mode', value: isStandalone() ? 'standalone' : 'browser' },
			{
				label: 'Viewport',
				value: viewport
					? `${Math.round(viewport.width)}×${Math.round(viewport.height)} (visual)`
					: `${window.innerWidth}×${window.innerHeight}`
			},
			{ label: 'User agent', value: navigator.userAgent }
		];
	});

	const lines = $derived<Line[]>([
		{ label: 'Version', value: version },
		{ label: 'User id', value: userId },
		{ label: 'Account timezone', value: accountTimezone },
		{ label: 'Features', value: features.length > 0 ? features.join(', ') : 'none' },
		{ label: 'Keyring', value: keyringStatus },
		...(device ?? [])
	]);

	async function copy() {
		try {
			await navigator.clipboard.writeText(
				lines.map((line) => `${line.label}: ${line.value}`).join('\n')
			);
			copied = 'copied';
		} catch {
			// Refused without a user gesture or permission; nothing was sent
			// anywhere, so there is no request failure to report.
			copied = 'failed';
		}
	}
</script>

<section class="debug-info" aria-label="Debug info">
	<header>
		<h2>Debug info</h2>
		<wa-button type="button" size="s" appearance="outlined" onclick={copy}>Copy</wa-button>
	</header>
	{#if copied === 'copied'}
		<p class="note" role="status">Copied.</p>
	{:else if copied === 'failed'}
		<p class="note" role="status">Couldn't copy. Select the text instead.</p>
	{/if}
	<dl>
		{#each lines as line (line.label)}
			<dt>{line.label}</dt>
			<dd>{line.value}</dd>
		{/each}
	</dl>
</section>

<style>
	.debug-info {
		margin-top: var(--wa-space-l);
		padding: 0.875rem 1rem;
		border: 1px dashed var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);

		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
		}

		h2 {
			margin: 0;
			font-size: var(--wa-font-size-m);
		}

		.note {
			margin: 0.5rem 0 0;
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}

		dl {
			display: grid;
			grid-template-columns: max-content 1fr;
			gap: 0.25rem 1rem;
			margin: 0.75rem 0 0;
			font-family: var(--wa-font-family-code, monospace);
			font-size: var(--wa-font-size-s);
		}

		dt {
			color: var(--wa-color-text-quiet);
		}

		dd {
			margin: 0;
			overflow-wrap: anywhere;
		}
	}
</style>
