<script lang="ts">
	/**
	 * The round amber "add" over the bottom of a list page, in its `ListDock`.
	 * Named by its icon, as an icon-only `wa-button` must be (AGENTS.md).
	 */
	let { href, label }: { href: string; label: string } = $props();
</script>

<wa-button class="add" variant="brand" appearance="accent" pill {href}>
	<wa-icon name="plus" variant="solid" {label}></wa-icon>
</wa-button>

<style>
	wa-button.add {
		--wa-form-control-height: 3.25rem;
		font-size: 1.25rem;
		border-radius: var(--wa-border-radius-pill);
		box-shadow: var(--wa-shadow-l);
	}
</style>
