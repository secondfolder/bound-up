<script lang="ts">
	import type { AvatarPerson } from '$lib/context-client.svelte';

	/**
	 * A context's avatar: a partner's initials in the colour you gave them,
	 * you as the person glyph in amber, Everyone as a pie with a slice per
	 * person, or the dashed "add" disc. See docs/contexts.md.
	 *
	 * Decoration only: whatever holds it names it (the switcher's buttons, a
	 * chip's text), so it is hidden from assistive tech.
	 */
	let {
		kind,
		size,
		people = []
	}: {
		kind: 'all' | 'solo' | 'shared' | 'add';
		/** The diameter, in px. */
		size: number;
		/** One person for a partner or you; everyone, you first, for Everyone. */
		people?: readonly AvatarPerson[];
	} = $props();

	/** Below this the pie's slices are too small for letters, and are colour only. */
	const PIE_LABEL_MIN = 36;

	const first = $derived(people[0]);

	/**
	 * Everyone's pie: each person's colour as a slice, with a thin gap of the
	 * page's darkest surface between them so neighbouring colours do not
	 * blur into one. Conic gradients start at the top and go clockwise.
	 */
	const pie = $derived.by(() => {
		const count = Math.max(people.length, 1);
		const step = 360 / count;
		const gap = size >= PIE_LABEL_MIN ? 1.6 : 1.2;
		const stops = ['var(--space-colour-gap) 0deg', `var(--space-colour-gap) ${gap}deg`];
		people.forEach((person, index) => {
			const start = index * step;
			const end = (index + 1) * step;
			stops.push(
				`${person.colour} ${start + gap}deg ${end - gap}deg`,
				`var(--space-colour-gap) ${end - gap}deg ${end + gap}deg`
			);
		});
		return `conic-gradient(${stops.join(', ')})`;
	});

	/** The disc's fill: the pie, one person's colour, or (for "add") the stylesheet's. */
	const fill = $derived.by(() => {
		if (kind === 'all') {
			return pie;
		}
		return kind === 'add' ? undefined : first?.colour;
	});

	/** Where each slice's initials sit: halfway round its slice, part way out. */
	const labels = $derived.by(() => {
		if (kind !== 'all' || size < PIE_LABEL_MIN) {
			return [];
		}
		const count = people.length;
		const step = 360 / Math.max(count, 1);
		const radius = size * (count <= 3 ? 0.26 : 0.31);
		const fontSize = size * (count <= 3 ? 0.19 : 0.15);
		return people.map((person, index) => {
			const angle = ((-90 + (index + 0.5) * step) * Math.PI) / 180;
			return {
				key: `${index}`,
				text: person.initials,
				x: size / 2 + radius * Math.cos(angle),
				y: size / 2 + radius * Math.sin(angle),
				fontSize
			};
		});
	});
</script>

<span
	class="avatar {kind}"
	aria-hidden="true"
	style:--size="{size}px"
	style:background={fill}
>
	{#if kind === 'shared'}
		<span class="initials" style:font-size="{Math.round(size * 0.38)}px">{first?.initials ?? ''}</span>
	{:else if kind === 'solo'}
		<wa-icon name="user" variant="solid" style:font-size="{Math.round(size * 0.46)}px"></wa-icon>
	{:else if kind === 'add'}
		<wa-icon name="plus" variant="solid" style:font-size="{Math.round(size * 0.46)}px"></wa-icon>
	{:else}
		{#each labels as label (label.key)}
			<span
				class="slice-label"
				style:left="{label.x}px"
				style:top="{label.y}px"
				style:font-size="{label.fontSize.toFixed(1)}px">{label.text}</span
			>
		{/each}
	{/if}
</span>

<style>
	.avatar {
		position: relative;
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		inline-size: var(--size);
		block-size: var(--size);
		border-radius: 50%;
		overflow: hidden;
		/* Dark ink on every fill: the palette is chosen to carry it. */
		color: var(--space-colour-ink);
		font-weight: var(--wa-font-weight-bold);
		line-height: 1;
	}

	.add {
		background: var(--wa-color-surface-lowered);
		border: 2px dashed var(--wa-color-brand-border-normal);
		color: var(--accent-tint);
	}

	.slice-label {
		position: absolute;
		translate: -50% -50%;
		font-weight: 800;
		white-space: nowrap;
	}
</style>
