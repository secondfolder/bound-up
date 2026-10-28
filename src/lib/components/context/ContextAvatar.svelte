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
	 * Everyone's pie, drawn in SVG on a 100-unit square centred on 0,0: a
	 * slice per person in their colour, from the top clockwise, with a dark
	 * line along each border between slices.
	 *
	 * The lines are drawn on top as constant-width strokes rather than left as
	 * gaps between slices. This used to be a conic gradient with an angular
	 * gap of the darkest surface at each border, and an angular gap is a
	 * wedge: wide at the rim and nothing at the centre. Chrome does not
	 * anti-alias a conic gradient's hard stops either, so where the wedge got
	 * narrower than a pixel it broke up and then vanished, and the middle of
	 * every divider was missing, the slices' bright colours meeting there
	 * with no line between them: the "white" patch at the centre. Opposite
	 * borders are drawn as one straight line through the centre, so a
	 * two-person pie's divider has no joint at all, and anything past the rim
	 * is clipped by the avatar's circle.
	 */
	const pie = $derived.by(() => {
		const count = people.length;
		const step = 360 / Math.max(count, 1);
		// Past the rim, so no edge of a slice or line shows inside the circle.
		const reach = 60;
		const at = (degrees: number) => {
			const angle = ((degrees - 90) * Math.PI) / 180;
			return `${(reach * Math.cos(angle)).toFixed(3)} ${(reach * Math.sin(angle)).toFixed(3)}`;
		};
		const slices = people.map((person, index) => ({
			key: `${index}`,
			colour: person.colour,
			d:
				count <= 1
					? `M 0 -${reach} A ${reach} ${reach} 0 1 1 0 ${reach} A ${reach} ${reach} 0 1 1 0 -${reach} Z`
					: `M 0 0 L ${at(index * step)} A ${reach} ${reach} 0 ${step > 180 ? 1 : 0} 1 ${at((index + 1) * step)} Z`
		}));
		// A line from the centre out along each border. Opposite borders (an
		// even count of people) are one line through the centre instead, so
		// no joint is drawn there at all.
		const point = (degrees: number) => {
			const angle = ((degrees - 90) * Math.PI) / 180;
			return { x: (reach * Math.cos(angle)).toFixed(3), y: (reach * Math.sin(angle)).toFixed(3) };
		};
		const through = count % 2 === 0;
		const dividers =
			count <= 1
				? []
				: Array.from({ length: through ? count / 2 : count }, (_, index) => {
						const to = point(index * step);
						const from = through ? point(index * step + 180) : { x: '0', y: '0' };
						return { key: `${index}`, x1: from.x, y1: from.y, x2: to.x, y2: to.y };
					});
		// About a pixel at 24px, growing slowly: in the square's units.
		const thickness = Math.max(1, size * 0.036);
		return { slices, dividers, width: ((thickness * 100) / size).toFixed(3) };
	});

	/** The disc's fill: one person's colour, or (for "add") the stylesheet's. Everyone's is its pie. */
	const fill = $derived(kind === 'all' || kind === 'add' ? undefined : first?.colour);

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
		<svg class="pie" viewBox="-50 -50 100 100" aria-hidden="true">
			{#each pie.slices as slice (slice.key)}
				<path d={slice.d} style:fill={slice.colour} />
			{/each}
			{#each pie.dividers as divider (divider.key)}
				<line x1={divider.x1} y1={divider.y1} x2={divider.x2} y2={divider.y2} stroke-width={pie.width} />
			{/each}
		</svg>
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

	.pie {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;

		line {
			stroke: var(--space-colour-gap);
			/* Square ends: a round end at the centre drew a dot where three or
			   five lines met. Odd counts' lines still overlap there, so no
			   gap opens between them. */
			stroke-linecap: butt;
		}
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
