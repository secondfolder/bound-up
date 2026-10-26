<script lang="ts">
	import type { RichTextBlockNode } from '$lib/richtext';
	import { isSurpriseFor, MAX_RATING, SECTION_LABELS } from '$lib/scenes/blocks';
	import { courseArtFor, courseArtStyle, designTitle, menuDesign } from '$lib/scenes/menu-designs';
	import RichTextInline from '../RichTextInline.svelte';
	import RichTextList from '../RichTextList.svelte';
	import MenuFrame from './MenuFrame.svelte';
	import '$lib/scenes/scene-blocks.css';

	/**
	 * A scene block in a stored document, read without an editor: a version
	 * of a scene in its history. The same elements and classes as the editor
	 * draws, so one stylesheet (`scene-blocks.css`, and a menu's design in
	 * `menu-designs.css`) styles both, a surprise for the partner included.
	 * No Lexical, like the rest of the read path. See docs/scenes.md,
	 * "Blocks".
	 */
	let {
		block,
		viewerId
	}: {
		block: Extract<RichTextBlockNode, { type: 'scene-section' | 'scene-menu' }>;
		/** Who is reading, so a surprise for them stays one. */
		viewerId: string | null;
	} = $props();

	const surprise = $derived(isSurpriseFor(block.hiddenFrom, viewerId));
	const STEPS = Array.from({ length: MAX_RATING }, (_, index) => index + 1);
</script>

<div class="scene-page">
	{#if block.type === 'scene-section'}
		<section
			class="scene-block scene-section"
			class:surprise
			class:only-me={block.hiddenFrom !== null}
			data-section={block.section}
			data-label={SECTION_LABELS[block.section]}
			aria-label={surprise ? 'A surprise' : SECTION_LABELS[block.section]}
		>
			{#if !surprise}
				{#each block.children as child, index (index)}
					{#if child.type === 'paragraph'}
						<p><RichTextInline nodes={child.children} /></p>
					{:else if child.type === 'heading'}
						<svelte:element this={child.tag} class="rt-{child.tag === 'h2' ? 'heading' : 'subheading'}"
							><RichTextInline nodes={child.children} /></svelte:element
						>
					{:else}
						<!-- Never tickable here: this is a version in a scene's history. -->
						<RichTextList list={child} />
					{/if}
				{/each}
			{/if}
		</section>
	{:else}
		{const design = $derived(menuDesign(block.design))}
		<MenuFrame
			{design}
			title={block.title}
			subtitle={block.subtitle}
			scale={block.scale}
			value={block.value}
			copy={block.copy}
			mascot={block.mascot}
			pictures={block.pictures}
			{surprise}
			onlyMe={block.hiddenFrom !== null}
			label="{block.title || designTitle(design, block.mascot)}, a menu"
		>
			{#if !surprise}
				{#each block.children as course, courseIndex (courseIndex)}
					{const art = $derived(courseArtFor(design, course.art, courseIndex))}
					<div class="scene-menu-course" style={courseArtStyle(art)}>
						{#each course.children as line, lineIndex (lineIndex)}
							{const hidden = $derived(isSurpriseFor(line.hiddenFrom, viewerId))}
							{const item = $derived(line.role === 'item' && !hidden)}
							{const rated = $derived(item && block.scale !== null)}
							{const valued = $derived(item && block.value !== null && line.value !== null)}
							<div
								class="scene-menu-line {line.role}"
								class:surprise={hidden}
								class:only-me={line.hiddenFrom !== null}
								class:checked={item && line.checked === true}
								data-rating={rated ? (line.rating ?? undefined) : undefined}
								data-value={valued ? (line.value ?? undefined) : undefined}
							>
								<!-- The box the editor draws (`drawLineCheck`). A picture here, not a
								     checkbox: a version is never ticked, so what it says is whether
								     the item was done. -->
								{#if item && line.checked !== null}<span
										class="menu-line-check"
										role="img"
										aria-label={line.checked ? 'Done' : 'Not done'}
									></span>{/if}{#if !hidden}<span class="menu-line-words"><RichTextInline nodes={line.children} /></span
									><span class="menu-line-extras" contenteditable="false" hidden={!(rated || valued)}
										>{#if rated}<span
												class="menu-rates"
												role="img"
												aria-label={line.rating ? `${line.rating} out of ${MAX_RATING}` : 'Not rated'}
												>{#each STEPS as step (step)}<i
														class={['menu-rate', step <= (line.rating ?? 0) && 'on']}
													></i>{/each}</span
											>{/if}{#if valued && line.value !== null}<span class="menu-value"
												>{design.value(line.value)}</span
											>{/if}</span
									>{/if}
							</div>
						{/each}
						{#if art}<span class="menu-course-art" role="img" aria-label={art.name}></span>{/if}
					</div>
				{/each}
			{/if}
		</MenuFrame>
	{/if}
</div>
