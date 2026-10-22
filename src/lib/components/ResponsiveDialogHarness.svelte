<script lang="ts">
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';

	/**
	 * Test-only wrapper.
	 *
	 * `ResponsiveDialog` takes its body and footer as snippets, which cannot be
	 * handed to `render()` as plain props. The `wa-details` is there to fire a
	 * bubbling `wa-after-hide` of its own.
	 */
	let {
		label,
		onclose,
		lightDismiss,
		withFooter = true,
		body = 'The body'
	}: {
		label: string;
		onclose: () => void;
		lightDismiss?: boolean;
		withFooter?: boolean;
		body?: string;
	} = $props();

	let dialog: ResponsiveDialog | undefined = $state();

	export function close() {
		dialog?.close();
	}
</script>

<ResponsiveDialog
	bind:this={dialog}
	{label}
	{onclose}
	{lightDismiss}
	footer={withFooter ? actions : undefined}
>
	<p class="body-text">{body}</p>
	<wa-details summary="More"><p>Nested</p></wa-details>
</ResponsiveDialog>

{#snippet actions()}
	<wa-button class="footer-action">Do it</wa-button>
{/snippet}
