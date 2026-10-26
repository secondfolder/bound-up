<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import {
		type BlockAtCaret,
		blockToText,
		setDesign,
		setHidden,
		setMenuExtras,
		setMenuHeading
	} from '$lib/lexical/plugins/scene-blocks';
	import {
		MAX_EXTRA_LABEL,
		MAX_MENU_SUBTITLE,
		MAX_MENU_TITLE,
		type MenuExtras
	} from '$lib/scenes/blocks';
	import {
		courseArtFor,
		courseArtStyle,
		designTitle,
		MENU_DESIGNS,
		menuDesign
	} from '$lib/scenes/menu-designs';
	import MenuFrame from './MenuFrame.svelte';
	import '$lib/components/choice-controls.css';

	/**
	 * The sidebar while the caret is in a menu, in place of the ideas and
	 * prompts: the menu's options. Its title and subtitle; what its items
	 * carry besides their words (a rating, a number), each named for the
	 * menu's key; hiding it; back to text; and its design. An item is rated
	 * and numbered on the page itself, and made a surprise from the selection
	 * toolbar. See docs/scenes.md, "Blocks".
	 */
	let {
		editor,
		menu,
		partnerId,
		readOnly
	}: {
		editor: LexicalEditor;
		menu: Extract<BlockAtCaret, { kind: 'menu' }>;
		/** The partner a menu can be hidden from; null in a solo scene. */
		partnerId: string | null;
		readOnly: boolean;
	} = $props();

	const EXTRAS: {
		extra: keyof MenuExtras;
		toggle: string;
		label: string;
		placeholder: string;
		hint: string;
	}[] = [
		{
			extra: 'scale',
			toggle: 'Enable menu item ratings',
			label: 'What the rating means',
			placeholder: 'Intensity',
			hint: 'One to five, set by tapping beside each item.'
		},
		{
			extra: 'value',
			toggle: 'Enable menu item values',
			label: 'What the number means',
			placeholder: 'Price',
			hint: 'Written the design’s way: a price on most, a percentage on the nutrition label.'
		}
	];

	const designs = Object.values(MENU_DESIGNS);

	function toggleExtra(extra: keyof MenuExtras, on: boolean) {
		setMenuExtras(editor, menu.key, { [extra]: on ? (menu.extras[extra] ?? '') : null });
	}

	/**
	 * A field that writes to the menu as it is typed in (or cleared, which
	 * Web Awesome sends as `input` too), and follows the menu when it changes
	 * elsewhere: on the menu itself, or on the partner's screen. Not while it
	 * is being typed in, though: refilling it then would move the caret, and
	 * what is typed is what the menu has anyway. Listened for by hand, because
	 * a `wa-input`'s typing happens in its shadow root, where Svelte's
	 * delegated `oninput` does not reliably reach (AGENTS.md).
	 */
	function textField(read: () => string, write: (text: string) => void) {
		return (field: HTMLElement & { value: string | null }) => {
			const text = read();
			if (!field.matches(':focus-within') && field.value !== text) {
				field.value = text;
			}
			const typed = () => write(field.value ?? '');
			field.addEventListener('input', typed);
			return () => field.removeEventListener('input', typed);
		};
	}
</script>

<div class="menu-options">
	{#key menu.key}
		<div class="fields">
			<wa-input
				{@attach textField(
					() => menu.heading.title,
					(title) => setMenuHeading(editor, menu.key, { title: title.slice(0, MAX_MENU_TITLE) })
				)}
				size="s"
				label="Title"
				placeholder={designTitle(menuDesign(menu.design), menu.mascot)}
				maxlength={MAX_MENU_TITLE}
				with-clear
				disabled={readOnly}
			></wa-input>
			<wa-input
				{@attach textField(
					() => menu.heading.subtitle,
					(subtitle) =>
						setMenuHeading(editor, menu.key, { subtitle: subtitle.slice(0, MAX_MENU_SUBTITLE) })
				)}
				size="s"
				label="Subtitle"
				placeholder={menuDesign(menu.design).subtitle ?? ''}
				maxlength={MAX_MENU_SUBTITLE}
				with-clear
				disabled={readOnly}
			></wa-input>
		</div>

		{#each EXTRAS as { extra, toggle, label, placeholder, hint } (extra)}
			<div class="extra">
				<wa-switch
					size="s"
					checked={menu.extras[extra] !== null}
					disabled={readOnly}
					onchange={(event: Event) =>
						toggleExtra(extra, (event.currentTarget as HTMLInputElement).checked)}
					>{toggle}</wa-switch
				>
				{#if menu.extras[extra] !== null}
					<wa-input
						{@attach textField(
							() => menu.extras[extra] ?? '',
							(name) => setMenuExtras(editor, menu.key, { [extra]: name.slice(0, MAX_EXTRA_LABEL) })
						)}
						size="s"
						{label}
						{placeholder}
						{hint}
						maxlength={MAX_EXTRA_LABEL}
						with-clear
						disabled={readOnly}
					></wa-input>
				{/if}
			</div>
		{/each}
	{/key}

	<div class="row">
		{#if partnerId}
			<!-- A toggle, so a native button: wa-button forwards no aria-pressed. -->
			<button
				type="button"
				class="choice-chip"
				disabled={readOnly}
				aria-pressed={menu.hiddenFrom !== null}
				onclick={() => setHidden(editor, menu.key, menu.hiddenFrom === null ? partnerId : null)}
			>
				Whole menu only me
			</button>
		{/if}
		<wa-button size="s" appearance="plain" disabled={readOnly} onclick={() => blockToText(editor, menu.key)}>
			Convert menu to plain text
		</wa-button>
	</div>

	<section aria-labelledby="menu-design-heading">
		<h2 id="menu-design-heading">Design</h2>
		<div class="designs">
			{#each designs as design (design.id)}
				<!-- A choice of one, so a native button with aria-pressed: wa-button
				     forwards no ARIA state. The preview is the design itself, small,
				     and named for assistive tech by the button's label. -->
				<button
					type="button"
					class="design-choice"
					disabled={readOnly}
					aria-label={design.name}
					title={design.name}
					aria-pressed={menu.design === design.id}
					onclick={() => setDesign(editor, menu.key, design.id)}
				>
					<span class="preview">
						<MenuFrame
							{design}
							title={menu.heading.title}
							subtitle={menu.heading.subtitle}
							mascot={menu.mascot}
							pictures={menu.pictures}
						>
							{const first = courseArtFor(design, {}, 0)}
							{const second = courseArtFor(design, {}, 1)}
							<!-- Each course's picture as a stored menu draws it (`SceneBlock`),
							     on a design whose courses have one. -->
							<div class="scene-menu-course" style={courseArtStyle(first)}>
								<div class="scene-menu-line heading"><span class="menu-line-words">Starters</span></div>
								<div class="scene-menu-line item"><span class="menu-line-words">Slow oil massage</span></div>
								<div class="scene-menu-line item"><span class="menu-line-words">Blindfold on</span></div>
								{#if first}<span class="menu-course-art"></span>{/if}
							</div>
							<div class="scene-menu-course" style={courseArtStyle(second)}>
								<div class="scene-menu-line heading"><span class="menu-line-words">Mains</span></div>
								<div class="scene-menu-line item"><span class="menu-line-words">Over the knee</span></div>
								{#if second}<span class="menu-course-art"></span>{/if}
							</div>
						</MenuFrame>
					</span>
				</button>
			{/each}
		</div>
	</section>
</div>

<style>
	.menu-options {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
	}

	section {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	h2 {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
	}

	.extra {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--wa-space-xs);

		& wa-input {
			align-self: stretch;
		}
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--wa-space-xs);
	}

	/* Two to a row: each preview takes the whole of its half. */
	.designs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--wa-space-xs);
	}

	/* Allowed to shrink to its half: a grid item will not go below its
	   content's own width otherwise, and a design's title that cannot wrap
	   pushed one preview over the next. */
	.design-choice {
		display: block;
		min-inline-size: 0;
		/* Web Awesome's native styles give every <button> a form control's
		   height, which the preview spilled out of onto the next row. */
		block-size: auto;
		padding: var(--wa-space-3xs);
		border: var(--wa-border-width-m) solid transparent;
		border-radius: var(--wa-border-radius-m);
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;

		&[aria-pressed='true'] {
			border-color: var(--wa-color-brand-border-loud);
			background: var(--wa-color-brand-fill-quiet);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	/*
	 * The design's own menu at half size, cut off below its first course or
	 * so: laid out as on a phone, which every design starts from. Its own
	 * `scene-page` container, so the design's width rules see the preview's
	 * width rather than the page's.
	 */
	.preview {
		display: block;
		inline-size: 100%;
		container: scene-page / inline-size;
		block-size: 12rem;
		overflow: hidden;
		border-radius: var(--wa-border-radius-s);
		pointer-events: none;
		/* What a button gives its text and a menu on the page does not have:
		   centred, and (Web Awesome's) never wrapped, which set previews'
		   lines in the middle and ran their words off the side. */
		text-align: start;
		white-space: normal;

		/* Twice the preview's height at half size: its own background to the
		   foot of the preview, however short the sample. */
		& > :global(.scene-menu) {
			zoom: 0.5;
			min-block-size: 24rem;
			margin: 0;
		}
	}
</style>
