<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';

	/**
	 * Test-only wrapper.
	 *
	 * `SectionWidget` takes its body as a snippet, and a snippet cannot be
	 * handed to `render()` as a plain prop — it has to be declared in a
	 * component. Same reason `RichTextEditorHarness` and `TimezoneSelectHarness`
	 * exist. A null `body` is how a test asks for the bodyless card.
	 */
	let {
		title,
		href,
		body = null
	}: { title: string; href?: string; body?: string | null } = $props();
</script>

<SectionWidget {title} {href} body={body === null ? undefined : text} />

{#snippet text()}
	<p>{body}</p>
{/snippet}
