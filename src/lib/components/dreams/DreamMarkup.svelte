<script lang="ts" module>
	/**
	 * What the user can set in a passage, and what they set. Live only on the
	 * passage being answered; earlier ones show what was sent.
	 */
	export type MarkupInputs = {
		live: boolean;
		choices: Readonly<Record<string, string>>;
		values: Readonly<Record<string, string>>;
		setChoice?: (id: string, value: string) => void;
		setValue?: (key: string, value: string) => void;
		/** Sends what was filled in as the turn: a block's Done button. */
		done?: () => void;
		/** Answers the passage's question, remembered for this daydream if asked. */
		answer?: (question: { id: string; text: string }, answer: string, remember: boolean) => void;
		/** What was answered, on an earlier passage. */
		answered?: Readonly<Record<string, string>>;
		/** Rolls the passage's die, as the turn. */
		roll?: (roll: { id: string; sides: number }) => void;
		/** What was rolled, on an earlier passage, by roll id. */
		rolled?: Readonly<Record<string, number>>;
	};

	const STILL: MarkupInputs = { live: false, choices: {}, values: {} };

	/** Pictures on a passage (docs/dreams.md, "Pictures"), by marker key. */
	export type MarkupPictures = {
		/** Whether this server makes pictures. */
		enabled: boolean;
		url: (key: string) => string | undefined;
		/** A picture is kept for the marker, opened or not. */
		has: (key: string) => boolean;
		making: (key: string) => boolean;
		/** Opens a kept picture. */
		show: (key: string) => void;
		draw: (key: string, picture: { of: string; caption: string }) => void;
	};
</script>

<script lang="ts">
	import { splitBeats, tidyBreaks } from '$lib/dream/beats';
	import {
		fieldKey,
		outcomeFor,
		type PassageBlock,
		type PassageField,
		passageAsk,
		passageBlocks,
		passageCycles,
		passageRoll
	} from '$lib/dream/fields';
	import { type InlineSegment, inlineSegments, speakerShade } from '$lib/dream/inline';
	import { type MarkupNode, type MarkupTag, parseMarkup, plainText } from '$lib/dream/markup';
	import { setChanges } from '$lib/dream/story';
	import DreamField from './DreamField.svelte';

	/**
	 * A passage's markup as the reader sees it (docs/dreams.md, "The
	 * markup"): speech in its speaker's colour, names linked to their cards,
	 * beats as space, spoilers blurred until tapped, `<more>` expanded on tap,
	 * cycling choices, and blocks in their own layouts with real fields. The
	 * footer is never shown. A tag this view does not draw shows its words, so
	 * nothing the model wrote is lost.
	 *
	 * In the tap-through view the passage shows a beat at a time, with Next
	 * and Back buttons as well as a tap anywhere on it.
	 */
	let {
		source,
		turnId,
		names,
		expansions,
		filling,
		streaming = false,
		view = 'scroll',
		inputs = STILL,
		pictures,
		onref,
		onmore
	}: {
		source: string;
		/** The passage's turn, which keys its `<more>` expansions; null while it streams. */
		turnId: string | null;
		names: { id: string; name: string }[];
		expansions: ReadonlyMap<string, string>;
		/** Keys of expansions being written. */
		filling: ReadonlySet<string>;
		streaming?: boolean;
		view?: 'scroll' | 'tap';
		inputs?: MarkupInputs;
		pictures?: MarkupPictures;
		onref: (id: string) => void;
		onmore: (key: string, phrase: string) => void;
	} = $props();

	// Breaks made even: a paragraph break and a beat are the same space.
	const nodes = $derived(tidyBreaks(parseMarkup(source, { final: !streaming })));
	const live = $derived(inputs.live && !streaming);

	/** Each `<more>` keyed by its order in the passage, so its expansion is found again. */
	const moreKeys = $derived.by(() => {
		const keys = new Map<MarkupTag, string>();
		let count = 0;
		let pictureCount = 0;
		const walk = (list: readonly MarkupNode[]) => {
			for (const node of list) {
				if (node.type !== 'tag') {
					continue;
				}
				if (node.name === 'more') {
					keys.set(node, `${turnId ?? 'streaming'}:more:${count}`);
					count += 1;
				}
				if (node.name === 'picture') {
					keys.set(node, `${turnId ?? 'streaming'}:picture:${pictureCount}`);
					pictureCount += 1;
				}
				walk(node.children);
			}
		};
		walk(nodes);
		return keys;
	});

	const blocks = $derived(passageBlocks(nodes));
	const blockFor = $derived(new Map(blocks.map((block) => [block.tag, block])));
	const fieldFor = $derived(
		new Map(
			blocks.flatMap((block) =>
				block.fields.map((field): [MarkupTag, { block: PassageBlock; field: PassageField }] => [
					field.tag,
					{ block, field }
				])
			)
		)
	);
	const cycleFor = $derived(new Map(passageCycles(nodes).map((cycle) => [cycle.tag, cycle])));
	const nameOf = $derived(new Map(names.map((entry) => [entry.id, entry.name])));
	const ask = $derived(passageAsk(nodes));
	const roll = $derived(passageRoll(nodes));
	let remember = $state(false);

	let revealed = $state(new Set<MarkupTag>());

	function words(list: readonly MarkupNode[]): string {
		return list.map((node) => (node.type === 'tag' ? words(node.children) : node.text)).join('');
	}

	const TONES = new Set(['whisper', 'loud', 'slow']);
	/** A paragraph break, after `tidyBreaks` has made them all one. */
	const PARAGRAPH_BREAK = '\n\n';
	const BLOCK_TAGS = new Set(['block', 'texts', 'letter']);
	/** Kinds with a layout of their own; any other is the generic labelled card. */
	const LAYOUTS = new Set([
		'contract',
		'rules',
		'report',
		'questionnaire',
		'punch-card',
		'schedule',
		'texts',
		'group-chat',
		'email',
		'voice-note',
		'call-response',
		'lines',
		'letter',
		'deck',
		'countdown'
	]);
	const DONE_LABELS: Record<string, string> = {
		contract: 'Sign and return',
		questionnaire: 'Hand it in',
		lines: 'Finish lines',
		'call-response': 'Done'
	};
	/** Kinds whose plain lines read as a list: one rule or one slot a line. */
	const LISTED = new Set(['rules', 'schedule', 'countdown']);

	function kindLabel(kind: string): string {
		const text = kind.replaceAll('-', ' ');
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	function lines(tag: MarkupTag): string[] {
		return plainText(tag.children)
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
	}

	function stamps(tag: MarkupTag): { filled: number; of: number; stamps: boolean[] } {
		const of = Math.min(40, Math.max(1, Number.parseInt(tag.attrs.of ?? '', 10) || 10));
		const filled = Math.min(of, Math.max(0, Number.parseInt(tag.attrs.filled ?? '', 10) || 0));
		return { filled, of, stamps: Array.from({ length: of }, (_, index) => index < filled) };
	}

	/** A voice note's waveform: decoration, the same for every note. */
	const WAVE = Array.from({ length: 24 }, (_, index) => 30 + ((index * 37) % 70));

	function nextOption(id: string, options: string[]) {
		const current = inputs.choices[id] ?? options[0] ?? '';
		const next = options[(options.indexOf(current) + 1) % options.length] ?? current;
		inputs.setChoice?.(id, next);
	}

	// ── tap-through ─────────────────────────────────────────────────────────────

	const beats = $derived(splitBeats(nodes));
	let shown = $state(1);
	const showing = $derived(view === 'tap' ? beats.slice(0, shown) : null);
	const more = $derived(view === 'tap' && shown < beats.length);

	/**
	 * A tap anywhere on the passage moves on, as in a visual novel. Only a
	 * pointer's shortcut: Next and Back are the buttons that do it for the
	 * keyboard and a screen reader, so the passage itself stays plain text.
	 */
	function tapToAdvance(element: HTMLElement) {
		element.addEventListener('click', advance);
		return () => element.removeEventListener('click', advance);
	}

	function advance(event: MouseEvent) {
		// A tap on the passage moves on, but not a tap on something in it.
		if (
			more &&
			!(
				event.target instanceof Element &&
				event.target.closest('button, a, input, wa-input, wa-button')
			)
		) {
			shown += 1;
		}
	}
</script>

{#snippet inline(segments: InlineSegment[])}
	{#each segments as segment, index (index)}
		{#if segment.kind === 'em'}
			<em>{segment.text}</em>
		{:else if segment.kind === 'strong'}
			<strong>{segment.text}</strong>
		{:else if segment.kind === 'link'}
			<!-- A native button: a name in running prose, which a wa-button would
			     break out of its line. Keyboard and role come with it. -->
			<button type="button" class="name" onclick={() => onref(segment.id)}>{segment.text}</button>
		{:else}
			{segment.text}
		{/if}
	{/each}
{/snippet}

{#snippet blockView(node: MarkupTag)}
	{const block = $derived(blockFor.get(node))}
	{const kind = $derived(block?.kind ?? 'block')}
	{const label = $derived(block?.title || kindLabel(kind))}
	<section class="block" data-kind={LAYOUTS.has(kind) ? kind : 'generic'} aria-label={label}>
		{#if kind === 'email'}
			<dl class="email-head">
				{#each ['from', 'to', 'cc', 'subject'] as part (part)}
					{#if node.attrs[part]}<dt>{kindLabel(part)}</dt><dd>{node.attrs[part]}</dd>{/if}
				{/each}
			</dl>
		{:else if kind === 'report'}
			<header class="letterhead">
				<strong>{block?.title || 'Report'}</strong>
				{#if node.attrs.date}<span>{node.attrs.date}</span>{/if}
			</header>
		{:else if kind !== 'texts' && kind !== 'group-chat'}
			<header class="block-head">
				<span class="kind" data-unspoken>{kindLabel(kind)}</span>
				{#if block?.title}<strong>{block.title}</strong>{/if}
				{#if node.attrs.now}<span class="now">Now: {node.attrs.now}</span>{/if}
			</header>
		{/if}
		{#if kind === 'punch-card'}
			{const card = $derived(stamps(node))}
			<div class="stamps" role="img" aria-label={`${card.filled} of ${card.of} stamps`}>
				{#each card.stamps as filled, index (index)}
					<span class="stamp" class:filled></span>
				{/each}
			</div>
		{:else if kind === 'voice-note'}
			<div class="waveform" aria-hidden="true">
				{#each WAVE as height, index (index)}<span style:height={`${height}%`}></span>{/each}
			</div>
			<p class="quiet" data-unspoken>Transcript</p>
		{/if}
		{#if LISTED.has(kind) && block?.fields.length === 0 && node.children.every((child) => child.type === 'text')}
			<ol class="lines">
				{#each lines(node) as line, index (index)}
					<li class:current={Boolean(node.attrs.now) && line.includes(node.attrs.now ?? '')}>{line}</li>
				{/each}
			</ol>
		{:else}
			<div class="block-body">{@render tree(node.children)}</div>
		{/if}
		{#if block && block.fields.length > 0 && live && inputs.done}
			<div class="block-done">
				<wa-button appearance="accent" variant="brand" onclick={() => inputs.done?.()}>
					{DONE_LABELS[kind] ?? 'Done'}
				</wa-button>
			</div>
		{/if}
	</section>
{/snippet}

{#snippet dice(offered: NonNullable<typeof roll>)}
	{const rolled = $derived(inputs.rolled?.[offered.id])}
	{const landed = $derived(rolled === undefined ? undefined : outcomeFor(offered, rolled))}
	<section class="roll" aria-label={`A roll of a d${offered.sides}`}>
		<ul class="outcomes">
			{#each offered.outcomes as outcome, index (index)}
				<li class:landed={landed === outcome}>
					<span class="faces">{outcome.from === outcome.to ? outcome.from : `${outcome.from}–${outcome.to}`}</span>
					<span>{@render tree(outcome.tag.children)}</span>
				</li>
			{/each}
		</ul>
		{#if rolled !== undefined}
			<p class="rolled" aria-live="polite">You rolled <strong>{rolled}</strong></p>
		{:else if live && inputs.roll}
			<wa-button appearance="accent" variant="brand" onclick={() => inputs.roll?.(offered)}>
				Roll a d{offered.sides}
			</wa-button>
		{/if}
	</section>
{/snippet}

{#snippet question(asked: NonNullable<typeof ask>)}
	{const given = $derived(inputs.answered?.[asked.id])}
	<section class="ask" aria-label="A question">
		<p class="ask-text">
			{#if asked.as}<span class="asker">{nameOf.get(asked.as) ?? asked.as}:</span>{/if}
			{asked.text}
		</p>
		{#if live && inputs.answer}
			<div class="ask-options">
				{#each asked.options as option (option)}
					<wa-button size="s" appearance="outlined" onclick={() => inputs.answer?.(asked, option, remember)}
						>{option}</wa-button
					>
				{/each}
			</div>
			<!-- A toggle: native, because wa-button forwards no aria-pressed. -->
			<button
				type="button"
				data-unspoken
				class="remember"
				aria-pressed={remember}
				onclick={() => {
					remember = !remember;
				}}
			>
				{remember ? '✓ ' : ''}Remember for this daydream
			</button>
			<p class="quiet" data-unspoken>Or answer in your own words below, or just carry on.</p>
		{:else if given}
			<p class="quiet" data-unspoken>You answered: <strong>{given}</strong></p>
		{/if}
	</section>
{/snippet}

{#snippet tree(list: readonly MarkupNode[])}
	{#each list as node, index (index)}
		{#if node.type === 'text'}
			<!-- On one line: whitespace between them would draw as a space before each paragraph. -->
			{#each node.text.split(PARAGRAPH_BREAK) as paragraph, at (at)}{#if at > 0}<span class="beat" aria-hidden="true"></span>{/if}{@render inline(inlineSegments(paragraph, names))}{/each}
		{:else if node.type === 'ref'}
			<button type="button" class="name" onclick={() => onref(node.id)}>{node.text}</button>
		{:else if node.name === 'after'}
			<!-- The footer is notes for the model. -->
		{:else if node.name === 'beat'}
			{#if node.attrs.kind === 'scene'}
				<wa-divider class="scene"></wa-divider>
			{:else}
				<span class="beat" aria-hidden="true"></span>
			{/if}
		{:else if node.name === 'say'}
			{const who = $derived(node.attrs.who ?? '')}
			<!-- `data-who` and `data-how` are for reading aloud: who says it, and how. -->
			<span class="say" data-shade={speakerShade(who)} data-you={who === 'you'} data-who={who} data-how={node.attrs.how}>
				<span class="speaker" data-unspoken>{who === 'you' ? 'You' : (nameOf.get(who) ?? who)}</span>
				{@render tree(node.children)}
			</span>
		{:else if BLOCK_TAGS.has(node.name)}
			{@render blockView(node)}
		{:else if node.name === 'field'}
			{const entry = $derived(fieldFor.get(node))}
			{#if entry}
				{const key = $derived(fieldKey(entry.block.key, entry.field.name))}
				<DreamField
					field={entry.field}
					value={inputs.values[key] ?? ''}
					{live}
					onchange={(value) => inputs.setValue?.(key, value)}
				/>
			{:else}
				{@render tree(node.children)}
			{/if}
		{:else if node.name === 'option'}
			<!-- Options belong to a field or a question, which draws them. -->
		{:else if node.name === 'roll'}
			{#if roll && roll.tag === node}
				{@render dice(roll)}
			{/if}
		{:else if node.name === 'on'}
			<!-- An outcome belongs to its roll, which draws it. -->
		{:else if node.name === 'set'}
			{const changes = $derived(setChanges(node))}
			<span class="earned">{@render tree(node.children)}</span>
			{#each Object.entries(changes) as [address, change] (address)}
				<span class="stat-change" data-unspoken>{change} {address.split('.')[1] ?? address}</span>
			{/each}
		{:else if node.name === 'picture'}
			{const key = $derived(moreKeys.get(node) ?? '')}
			{const caption = $derived(words(node.children).trim())}
			{const url = $derived(pictures?.url(key))}
			<figure class="picture" data-unspoken>
				{#if url}
					<img src={url} alt={caption || 'A picture from the story'} />
				{:else if pictures?.making(key) || pictures?.has(key)}
					<div class="picture-waiting" role="status" aria-label="Making the picture" {@attach () => pictures?.show(key)}>
						<wa-skeleton effect="sheen"></wa-skeleton>
					</div>
				{:else if pictures?.enabled && turnId !== null && !streaming}
					<wa-button
						size="s"
						appearance="outlined"
						onclick={() => pictures?.draw(key, { of: node.attrs.of ?? '', caption })}>Show a picture</wa-button
					>
				{/if}
				{#if caption}<figcaption>{caption}</figcaption>{/if}
			</figure>
		{:else if node.name === 'ask'}
			{#if ask && ask.tag === node}
				{@render question(ask)}
			{/if}
		{:else if node.name === 'cycle'}
			{const cycle = $derived(cycleFor.get(node))}
			{#if cycle && cycle.options.length > 0}
				{const current = $derived(inputs.choices[cycle.id] ?? cycle.options[0] ?? '')}
				{#if live && cycle.options.length > 1}
					<button
						type="button"
						class="cycle"
						aria-label={`Change: ${cycle.label}, now ${current}`}
						onclick={() => nextOption(cycle.id, cycle.options)}>{current}</button
					>
				{:else}
					<span class="cycle-set">{current}</span>
				{/if}
			{/if}
		{:else if node.name === 'hidden'}
			{#if revealed.has(node)}
				<span class="hidden-open">{@render tree(node.children)}</span>
			{:else}
				<!-- A disclosure: a native button, since wa-button forwards no aria-expanded. -->
				<button
					type="button"
					class="spoiler"
					aria-expanded="false"
					aria-label={`Reveal: ${node.attrs.label ?? 'hidden text'}`}
					onclick={() => {
						revealed = new Set([...revealed, node]);
					}}
				>
					<span class="blur" aria-hidden="true">{words(node.children)}</span>
					<span class="label" aria-hidden="true">{node.attrs.label ?? 'Tap to reveal'}</span>
				</button>
			{/if}
		{:else if node.name === 'more'}
			{const key = $derived(moreKeys.get(node) ?? '')}
			<button
				type="button"
				class="more"
				aria-label={`Read more: ${words(node.children)}`}
				disabled={streaming || turnId === null}
				onclick={() => onmore(key, words(node.children))}
			>
				{@render tree(node.children)}
			</button>
			{#if expansions.has(key)}
				<span class="expansion">{expansions.get(key)}</span>
			{:else if filling.has(key)}
				<wa-skeleton class="expanding" effect="sheen"></wa-skeleton>
			{/if}
		{:else if TONES.has(node.name)}
			<span class="tone {node.name}" data-tone={node.name} data-how={node.attrs.how}>{@render tree(node.children)}</span>
		{:else if node.name === 'sound'}
			<!-- A sound someone makes: shown as an action, read aloud as one. -->
			<em class="sound" data-who={node.attrs.who}>{words(node.children)}</em>
		{:else}
			{@render tree(node.children)}
		{/if}
	{/each}
{/snippet}

{#if showing}
	<div class="markup tap" class:streaming {@attach tapToAdvance}>
		{#each showing as beat, index (index)}
			<div class="tap-beat">{@render tree(beat)}</div>
		{/each}
	</div>
	{#if beats.length > 1}
		<div class="tap-controls" data-unspoken>
			<wa-button
				size="s"
				appearance="plain"
				disabled={shown <= 1}
				onclick={() => {
					shown -= 1;
				}}>Back</wa-button
			>
			<span class="quiet">{Math.min(shown, beats.length)} of {beats.length}</span>
			<wa-button
				size="s"
				appearance="outlined"
				disabled={!more}
				onclick={() => {
					shown += 1;
				}}>Next</wa-button
			>
		</div>
	{/if}
{:else}
	<div class="markup" class:streaming>{@render tree(nodes)}</div>
{/if}

<style>
	.markup {
		white-space: pre-line;
		line-height: 1.65;
		overflow-wrap: anywhere;
	}

	.tap-beat + .tap-beat {
		margin-top: var(--wa-space-m);
	}

	.tap-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: var(--wa-space-s);
	}

	.quiet {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.name {
		all: unset;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-color: var(--dream-accent, var(--wa-color-brand-on-quiet));
		text-underline-offset: 0.2em;

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	.say {
		color: var(--speaker, inherit);

		&[data-shade='0'] {
			--speaker: var(--wa-color-brand-on-quiet);
		}
		&[data-shade='1'] {
			--speaker: var(--wa-color-success-on-quiet);
		}
		&[data-shade='2'] {
			--speaker: var(--wa-color-warning-on-quiet);
		}
		&[data-shade='3'] {
			--speaker: var(--wa-color-danger-on-quiet);
		}
		&[data-shade='4'] {
			--speaker: var(--wa-color-neutral-on-quiet);
		}
	}

	/* Named only where several people talk in one block. */
	.speaker {
		display: none;
	}

	.beat {
		display: block;
		height: var(--wa-space-m);
	}

	.scene {
		margin-block: var(--wa-space-l);
	}

	.spoiler {
		all: unset;
		position: relative;
		cursor: pointer;
		border-radius: var(--wa-border-radius-s);
		background: var(--wa-color-surface-lowered);

		.blur {
			filter: blur(0.35em);
			user-select: none;
		}

		.label {
			position: absolute;
			inset: 0;
			display: grid;
			place-items: center;
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	.more,
	.cycle {
		all: unset;
		cursor: pointer;
		border-bottom: 1px dashed var(--dream-accent, var(--wa-color-brand-on-quiet));

		&:disabled {
			cursor: default;
			border-bottom-color: transparent;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	.cycle {
		color: var(--dream-accent, var(--wa-color-brand-on-quiet));
	}

	.cycle-set {
		font-style: italic;
	}

	.expansion {
		color: var(--wa-color-text-quiet);

		&::before {
			content: ' ';
		}
	}

	.expanding {
		display: inline-block;
		width: 8rem;
		vertical-align: middle;
	}

	.tone.whisper {
		font-size: 0.9em;
		opacity: 0.8;
	}

	.tone.loud {
		font-weight: var(--wa-font-weight-bold);
	}

	.tone.slow {
		letter-spacing: 0.04em;
	}

	.sound {
		color: var(--wa-color-text-quiet);
	}

	.roll {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--wa-space-xs);
		margin-block: var(--wa-space-s);
		white-space: normal;
	}

	.outcomes {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			gap: var(--wa-space-s);
			opacity: 0.85;
		}

		li.landed {
			opacity: 1;
			font-weight: var(--wa-font-weight-bold);
		}

		.faces {
			min-width: 2.5em;
			font-variant-numeric: tabular-nums;
		}
	}

	.rolled {
		margin: 0;
	}

	.earned {
		text-decoration: underline dotted;
		text-underline-offset: 0.25em;
	}

	.stat-change {
		margin-inline-start: var(--wa-space-3xs);
		padding: 0 var(--wa-space-2xs);
		border-radius: var(--wa-border-radius-pill);
		background: color-mix(
			in oklab,
			var(--dream-accent, var(--wa-color-brand-on-quiet)) 20%,
			transparent
		);
		font-size: var(--wa-font-size-xs);
		white-space: nowrap;
	}

	.ask {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
		margin-block: var(--wa-space-s);
		padding: var(--wa-space-s) var(--wa-space-m);
		border-left: 3px solid var(--dream-accent, var(--wa-color-brand-on-quiet));
		white-space: normal;

		p {
			margin: 0;
		}
	}

	.asker {
		font-weight: var(--wa-font-weight-bold);
	}

	.ask-options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-2xs);
	}

	.remember {
		align-self: flex-start;
		padding: var(--wa-space-3xs) var(--wa-space-s);
		border: 1px solid color-mix(in oklab, currentColor 35%, transparent);
		border-radius: var(--wa-border-radius-pill);
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--wa-font-size-s);
		cursor: pointer;

		&[aria-pressed='true'] {
			background: var(--wa-color-brand-fill-quiet);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	/* ── blocks ─────────────────────────────────────────────────────────── */

	.block {
		display: block;
		margin-block: var(--wa-space-s);
		padding: var(--wa-space-m);
		border: 1px solid color-mix(in oklab, currentColor 25%, transparent);
		border-radius: var(--wa-border-radius-m);
		background: color-mix(in oklab, currentColor 4%, transparent);
		white-space: pre-line;
	}

	.block-head,
	.letterhead {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--wa-space-xs);
		margin-bottom: var(--wa-space-s);
		white-space: normal;

		.kind {
			font-size: var(--wa-font-size-xs);
			letter-spacing: 0.08em;
			text-transform: uppercase;
			opacity: 0.7;
		}
	}

	.now {
		margin-left: auto;
		font-size: var(--wa-font-size-s);
	}

	.lines {
		margin: 0;
		padding-left: 1.5em;
		white-space: normal;

		li.current {
			font-weight: var(--wa-font-weight-bold);
		}
	}

	.block-done {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--wa-space-s);
	}

	.block[data-kind='contract'],
	.block[data-kind='report'],
	.block[data-kind='letter'],
	.block[data-kind='questionnaire'] {
		font-family: var(--dream-paper-face);
	}

	.block[data-kind='contract'] .block-body {
		counter-reset: clause;
	}

	.block[data-kind='contract'] :global(.field) {
		counter-increment: clause;

		&::before {
			content: counter(clause) '.';
			font-weight: var(--wa-font-weight-bold);
		}
	}

	.letterhead {
		justify-content: space-between;
		padding-bottom: var(--wa-space-xs);
		border-bottom: 2px solid currentColor;
	}

	.block[data-kind='letter'] {
		border-style: none;
		box-shadow: var(--wa-shadow-s);
	}

	.block[data-kind='texts'],
	.block[data-kind='group-chat'] {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-2xs);
		border: none;
		background: none;
		padding-inline: 0;

		.block-body {
			display: flex;
			flex-direction: column;
			gap: var(--wa-space-2xs);
			white-space: normal;
		}

		.say {
			align-self: flex-start;
			max-width: 80%;
			padding: var(--wa-space-2xs) var(--wa-space-s);
			border-radius: var(--wa-border-radius-l);
			background: var(--wa-color-surface-raised);
			color: inherit;
		}

		.say[data-you='true'] {
			align-self: flex-end;
			background: var(--wa-color-brand-fill-normal);
		}
	}

	.block[data-kind='group-chat'] .speaker {
		display: block;
		font-size: var(--wa-font-size-xs);
		color: var(--speaker);
	}

	.email-head {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--wa-space-3xs) var(--wa-space-s);
		margin: 0 0 var(--wa-space-s);
		padding-bottom: var(--wa-space-xs);
		border-bottom: 1px solid color-mix(in oklab, currentColor 25%, transparent);
		white-space: normal;

		dt {
			opacity: 0.7;
		}

		dd {
			margin: 0;
		}
	}

	.stamps {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-xs);
		margin-bottom: var(--wa-space-s);
	}

	.stamp {
		width: 1.75rem;
		height: 1.75rem;
		border: 2px dashed color-mix(in oklab, currentColor 40%, transparent);
		border-radius: 50%;

		&.filled {
			border-style: solid;
			border-color: var(--dream-accent, var(--wa-color-brand-on-quiet));
			background: color-mix(
				in oklab,
				var(--dream-accent, var(--wa-color-brand-on-quiet)) 50%,
				transparent
			);
		}
	}

	.waveform {
		display: flex;
		align-items: center;
		gap: 3px;
		height: 2rem;
		margin-bottom: var(--wa-space-xs);

		span {
			flex: 1;
			border-radius: 2px;
			background: color-mix(in oklab, currentColor 45%, transparent);
		}
	}

	.block[data-kind='call-response'] .say {
		display: block;
		font-weight: var(--wa-font-weight-bold);
	}

	.block[data-kind='lines'] .block-body {
		font-family: 'Bradley Hand', 'Segoe Print', cursive;
	}

	@media (prefers-reduced-motion: no-preference) {
		.tap-beat:last-child {
			animation: arrive 300ms ease-out;
		}
	}

	@keyframes arrive {
		from {
			opacity: 0;
		}
	}

	.block[data-kind='countdown'] .lines {
		padding: 0;
		list-style: none;
		text-align: center;
		font-size: var(--wa-font-size-3xl);
		font-variant-numeric: tabular-nums;
	}

	.picture {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--wa-space-2xs);
		margin: var(--wa-space-s) 0;
		white-space: normal;

		img {
			max-width: 100%;
			border-radius: var(--wa-border-radius-m);
		}

		figcaption {
			font-size: var(--wa-font-size-s);
			opacity: 0.8;
		}
	}

	.picture-waiting {
		width: min(100%, 20rem);
		aspect-ratio: 832 / 1216;

		wa-skeleton {
			width: 100%;
			height: 100%;
		}

		wa-skeleton::part(indicator) {
			border-radius: var(--wa-border-radius-m);
		}
	}
</style>
