<script lang="ts">
	import type { Snippet } from 'svelte';
	import { markBraceletLines } from '$lib/scenes/bracelet';
	import { keepConfetti } from '$lib/scenes/confetti';
	import {
		copyFields,
		designTitle,
		type MenuCopyOverrides,
		type MenuDesign,
		type MenuPictureChoices,
		mascotFor,
		menuCopy,
		picturesFor,
		type ShownMenuCopy
	} from '$lib/scenes/menu-designs';
	import {
		ART_PIECES,
		beadRuns,
		COURSES_CLASS,
		characters,
		HOLD_OPEN,
		MENU_FILTERS
	} from '$lib/scenes/menu-frame';
	import { playWhilePointedAt } from '$lib/scenes/play-on-hover';
	import { spinWhenSwept } from '$lib/scenes/spinners';
	import '$lib/scenes/scene-blocks.css';
	import '$lib/scenes/menu-designs.css';

	/**
	 * A scene menu's frame, drawn without an editor: the same elements as
	 * `buildMenuFrame` builds in one (`$lib/scenes/menu-frame`), so a stored
	 * version and a design's preview look as the menu does while it is
	 * written. `MenuFrame.svelte.test.ts` holds the two to one shape.
	 */
	let {
		design,
		title = '',
		subtitle = '',
		scale = null,
		value = null,
		copy = {},
		mascot = {},
		pictures = {},
		surprise = false,
		onlyMe = false,
		label,
		children
	}: {
		design: MenuDesign;
		/** The menu's own title; empty for the design's. */
		title?: string;
		/** A line under the title; empty for none. */
		subtitle?: string;
		/** The scale's name, for the key; null when items are not rated. */
		scale?: string | null;
		/** What an item's number means, for the key; null when items have none. */
		value?: string | null;
		/** What the menu has rewritten of its designs' copy. */
		copy?: MenuCopyOverrides;
		/** The mascot the menu has chosen, per design (`MenuDesign.mascot`). */
		mascot?: Readonly<Record<string, string>>;
		/** The pictures the menu has chosen for a design's row (`MenuDesign.pictures`). */
		pictures?: MenuPictureChoices;
		/** Hidden from whoever is looking: the frame and nothing in it. */
		surprise?: boolean;
		onlyMe?: boolean;
		/** The menu's accessible name; none for a preview, which is decoration. */
		label?: string;
		children?: Snippet;
	} = $props();

	const pieces = Array.from({ length: ART_PIECES }, (_, index) => index);
	const words = $derived(menuCopy(design, copy));
	const shownMascot = $derived(mascotFor(design, mascot));
	const shownPictures = $derived(picturesFor(design, pictures));
	const shownTitle = $derived(title || designTitle(design, mascot));
	const shownSubtitle = $derived(subtitle || design.subtitle || '');
	/** The design's copy placed in `place`, as `buildMenuFrame` places it. */
	const placed = (place: string) => words.filter((each) => each.place === place);
</script>

{#snippet copyText(each: ShownMenuCopy)}
	<span
		class="menu-copy"
		data-copy={each.key}
		data-placeholder={each.original}
		data-fields={each.fields ? '' : undefined}
		data-one-line={each.oneLine ? '' : undefined}
		>{#if each.fields && each.text !== ''}{#each copyFields(each.text) as field, line (line)}<span
					class="copy-line"
					><span class="copy-label"
						>{field.label === '' && field.value === '' ? HOLD_OPEN : field.label}</span
					><span class="copy-value">{field.value}</span
					></span
				>{/each}{:else}{each.text}{/if}</span
	>
{/snippet}

<section
	class={['scene-block', 'scene-menu', !surprise && `design-${design.id}`]}
	class:surprise
	class:only-me={onlyMe}
	data-design={design.id}
	data-mascot={shownMascot?.id}
	aria-label={surprise ? 'A surprise' : label}
	aria-hidden={label === undefined && !surprise ? 'true' : undefined}
	{@attach (menu: HTMLElement) => (surprise ? undefined : playWhilePointedAt(menu))}
>
	<svg
		class="menu-filters"
		aria-hidden="true"
		{@attach (svg: SVGSVGElement) => {
			svg.innerHTML = MENU_FILTERS;
		}}
	></svg>
	{#if design.confetti}
		<span
			class="menu-confetti"
			contenteditable="false"
			aria-hidden="true"
			{@attach (layer: HTMLElement) => (surprise ? undefined : keepConfetti(layer))}
		></span>
	{/if}
	{#if design.spinners}
		<span
			class="menu-spinners"
			contenteditable="false"
			aria-hidden="true"
			{@attach (row: HTMLElement) => (row.parentElement ? spinWhenSwept(row.parentElement) : undefined)}
			>{#each Array.from({ length: design.spinners }) as _, piece (piece)}<i></i>{/each}</span
		>
	{/if}
	<div class="menu-sheet">
		<span class="menu-art" contenteditable="false">
			{#each pieces as piece (piece)}<i
					>{#each placed(`art${piece + 1}`) as each (each.key)}{@render copyText(each)}{/each}</i
				>{/each}
		</span>
		<div class="menu-head" contenteditable="false">
			{#if shownMascot}
				<span
					class="menu-mascot"
					role="img"
					aria-label={shownMascot.name}
					data-art={shownMascot.id}
					style:--mascot="url('{shownMascot.url}')"
				></span>
			{/if}
			{#if design.pictures}
				<span class="menu-pictures"
					>{#each shownPictures as picture, place (place)}<span
							class="menu-picture"
							role="img"
							aria-label={picture.name}
							data-art={picture.id}
							data-place={place}
							style:--picture="url('{picture.url}')"
						></span>{/each}</span
				>
			{/if}
			<span class="menu-title" data-letters={design.titleLetters ? '' : undefined}
				>{#if design.titleLetters && shownTitle !== ''}{#each characters(shownTitle) as letter, at (at)}<span
							class={['title-letter', letter.gap && 'gap']}
							style:--letter={at}>{letter.char}</span
						>{/each}{:else}{shownTitle}{/if}</span
			>
			<span
				class="menu-subtitle"
				data-beads={design.subtitleBeads ? '' : undefined}
				{@attach (subtitle: HTMLElement) =>
					design.subtitleBeads ? markBraceletLines(subtitle) : undefined}
				>{#if design.subtitleBeads && shownSubtitle !== ''}{#each beadRuns(shownSubtitle) as run, at (at)}{#if run.gap}<span
							class="bead gap">{run.char}</span
						>{:else}<span class="bead-word"
							>{#each run.word as char, place (place)}<span class="bead">{char}</span>{/each}</span
						>{/if}{/each}{:else}{shownSubtitle}{/if}</span
			>
			<span class="menu-note">{#each placed('note') as each (each.key)}{@render copyText(each)}{/each}</span>
			{#each placed('head') as each (each.key)}{@render copyText(each)}{/each}
		</div>
		<div class="menu-intro" contenteditable="false">
			{#each placed('intro') as each (each.key)}{@render copyText(each)}{/each}
		</div>
		<div class={COURSES_CLASS}>{@render children?.()}</div>
		<div class="menu-key" contenteditable="false" hidden={!(scale || value)}>
			<span class="menu-key-scale" hidden={!scale}
				><i class="menu-rate on"></i><span class="menu-key-label">{scale ?? ''}</span></span
			>
			<span class="menu-key-value" hidden={!value}
				><b class="menu-key-mark">{design.valueKey}</b><span class="menu-key-label">{value ?? ''}</span></span
			>
		</div>
		<div class="menu-foot" contenteditable="false">
			{#each placed('foot') as each (each.key)}{@render copyText(each)}{/each}
		</div>
	</div>
</section>
