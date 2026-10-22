<script lang="ts">
	/**
	 * A dashed row where the next item would go: a to-do list's own way of
	 * saying "add one", above the list rather than a button over it.
	 */
	let { href, label }: { href: string; label: string } = $props();
</script>

<a class="quick-add" {href}>
	<wa-icon name="plus" variant="solid"></wa-icon>
	{label}
</a>

<style>
	.quick-add {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-block-size: 2.75rem;
		padding-inline: 0.75rem;
		border: 1px dashed var(--wa-color-surface-border);
		border-radius: var(--wa-panel-border-radius);
		color: var(--wa-color-text-quiet);
		text-decoration: none;

		& wa-icon {
			color: var(--wa-color-brand-on-quiet);
		}

		@media (hover: hover) {
			&:hover {
				color: var(--wa-color-text-normal);
				border-color: var(--wa-color-brand-border-normal);
			}
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}
</style>
