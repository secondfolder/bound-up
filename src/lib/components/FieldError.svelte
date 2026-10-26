<script lang="ts">
	/**
	 * What is wrong with a field's value, under the field: the one way every
	 * field says so (docs/theme.md, "Invalid fields"). Its field carries
	 * `aria-invalid="true"` while there is a message, which the theme draws
	 * in red. Announced as it appears (`role="alert"`), since it usually
	 * appears while someone is typing and looking at what they type.
	 */
	let { message }: { message: string | null | undefined } = $props();
</script>

{#if message}<span class="field-error" role="alert">{message}</span>{/if}

<style>
	.field-error {
		display: block;
		margin-block-start: var(--wa-space-2xs);
		color: var(--wa-color-text-danger);
		font-size: var(--wa-font-size-s);
	}
</style>
