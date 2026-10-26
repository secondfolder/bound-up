<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { RichTextListNode } from '$lib/richtext';
	import RichTextInline, { type InlineEmbedContext } from './RichTextInline.svelte';

	/**
	 * One list of a stored document, read without an editor: bulleted,
	 * numbered or to-do. `RichText` draws a document's lists with it, and
	 * `SceneBlock` the lists inside a scene's section.
	 *
	 * A to-do item is a real `wa-checkbox` with the item as its label, which is
	 * what names the box for assistive tech (the element forwards no
	 * `aria-label`). It can be ticked only when `onToggle` is given — the
	 * reader may edit the document it is reading — and is disabled otherwise:
	 * everywhere else a document is read, it cannot be changed, and a box
	 * that ticked and then quietly unticked would be worse than one that says
	 * up front it cannot. See docs/rich-text.md, "To-do lists".
	 */
	let {
		list,
		embeds,
		onToggle
	}: {
		list: RichTextListNode;
		embeds?: InlineEmbedContext | undefined;
		/** Ticks or unticks the item at an index; absent when the reader may not. */
		onToggle?: ((item: number, checked: boolean) => void) | undefined;
	} = $props();

	/**
	 * Follows the box with a listener on the element, as `CheckboxField` does:
	 * Svelte's delegated `onchange` does not reliably cross a custom element's
	 * shadow boundary (AGENTS.md). Reads `checked` from the element, which has
	 * already flipped by the time `change` fires.
	 */
	function follow(item: number): Attachment<HTMLElement> {
		return (element) => {
			const box = element as HTMLElement & { checked?: boolean };
			const changed = () => onToggle?.(item, Boolean(box.checked));
			box.addEventListener('change', changed);
			return () => box.removeEventListener('change', changed);
		};
	}
</script>

{#if list.listType === 'check'}
	<ul class="checklist">
		{#each list.children as item, index (index)}
			<li class={{ checked: item.checked === true }}>
				<!-- No whitespace inside the label: it would render as a space before
				     the item's first character. -->
				<wa-checkbox
					class={{ 'read-only': !onToggle }}
					checked={item.checked === true}
					disabled={!onToggle}
					{@attach follow(index)}
					><RichTextInline nodes={item.children} {embeds} /></wa-checkbox
				>
			</li>
		{/each}
	</ul>
{:else if list.listType === 'number'}
	<ol start={list.start}>
		{#each list.children as item, index (index)}
			<li><RichTextInline nodes={item.children} {embeds} /></li>
		{/each}
	</ol>
{:else}
	<ul>
		{#each list.children as item, index (index)}
			<li><RichTextInline nodes={item.children} {embeds} /></li>
		{/each}
	</ul>
{/if}

<style>
	ul,
	ol {
		margin: 0;
		padding-inline-start: 1.5em;
	}

	/* Inset by the focus ring's reach, as the editor's to-do list is, so the
	   two line up and a focused box's ring is never clipped. */
	.checklist {
		padding-inline-start: calc(var(--wa-focus-ring-width) + var(--wa-focus-ring-offset));
		list-style: none;
	}

	/* The box carries the prose around it rather than a form control's own
	   type, so a to-do list reads as part of the text it is in. */
	wa-checkbox {
		color: inherit;
		font: inherit;
		line-height: inherit;
	}

	/* Disabled only because this reader may not change the document, so the
	   item stays as readable as the text around it; the box alone is dimmed,
	   and the pointer does not say "not allowed" over every word of it. */
	wa-checkbox.read-only::part(base) {
		opacity: 1;
		cursor: default;
	}

	wa-checkbox.read-only::part(control) {
		opacity: 0.6;
	}

	/* As the editor draws a ticked item (`.rt-checked`): done, and quieter. */
	.checked {
		color: var(--wa-color-text-quiet);
		text-decoration: line-through;
	}
</style>
