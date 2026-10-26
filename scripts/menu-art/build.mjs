#!/usr/bin/env node
/**
 * Draws the scene menu designs' pictures (src/lib/scenes/menu-designs.css)
 * into static/menu-art/, one SVG file each: the textures, the ornaments and
 * the per-course drawings. Drawn here, in code, because most of them are
 * worked out (a sky scattered from a seed, a vine stitched from a pattern,
 * a cloud's bumps rising to a crest) and the CSS would otherwise carry them
 * as unreadable data URLs.
 *
 * Each is used as a CSS background, where an SVG is an image: it cannot
 * reach the page's fonts or `currentColor`, so every colour is its own and
 * any words a design shows are in the CSS. A monochrome piece a design
 * recolours (a paw, a bone) is black, and the CSS uses it as a mask.
 *
 * Run by hand when a drawing changes: `node scripts/menu-art/build.mjs`.
 * Ported from the designs' review mockup; see docs/scenes.md, "Menu designs".
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const outDir = join(root, 'static/menu-art');

/** Every file, by name. */
const files = new Map();

const svg = (viewBox, body, attrs = '') =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${attrs ? ` ${attrs}` : ''}>${body}</svg>`;
const draw = (name, viewBox, body, attrs = '') => files.set(name, svg(viewBox, body, attrs));

/** A seeded random, so a scattered sky or a cloud's puffs come out the same each build. */
function seeded(seedValue) {
	let state = seedValue;
	return () => {
		state = (state * 9301 + 49_297) % 233_280;
		return state / 233_280;
	};
}

/** The first of `choices` whose threshold `value` is under, or the last: a step function without nested ternaries. */
const pick = (value, choices) => (choices.find(([under]) => value < under) ?? choices.at(-1))[1];
const repeat = (count, make) => Array.from({ length: count }, (_, index) => make(index)).join('');
const fixed = (value) => value.toFixed(1);

/* ── textures: SVG noise, as tiles ─────────────────────────────────────── */

function noise(name, { freq, oct, type = 'fractalNoise', rgb = [0, 0, 0], a, size, seed = 2 }) {
	draw(
		name,
		`0 0 ${size} ${size}`,
		`<filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="${type}" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  ${a[0]} 0 0 0 ${a[1]}"/></filter><rect width="100%" height="100%" filter="url(#n)"/>`,
		`width="${size}" height="${size}"`
	);
}

noise('grain-dark', { freq: '0.9', oct: 2, a: [0.28, -0.06], size: 240 });
noise('wood', {
	type: 'turbulence',
	freq: '0.008 0.22',
	oct: 3,
	rgb: [0.12, 0.06, 0.02],
	a: [0.75, -0.1],
	size: 360,
	seed: 3
});
noise('stone', { freq: '0.045', oct: 5, a: [1.1, -0.35], size: 300, seed: 11 });
noise('slate', { freq: '0.5 0.06', oct: 3, rgb: [1, 1, 1], a: [0.22, -0.06], size: 200, seed: 5 });
noise('rust', { freq: '0.3', oct: 3, rgb: [0.45, 0.2, 0.05], a: [0.9, -0.35], size: 160, seed: 8 });
noise('paper', {
	freq: '0.7',
	oct: 2,
	rgb: [0.4, 0.28, 0.12],
	a: [0.2, -0.03],
	size: 220,
	seed: 6
});
noise('mottle', {
	freq: '0.018',
	oct: 3,
	rgb: [0.55, 0.38, 0.15],
	a: [0.38, -0.12],
	size: 420,
	seed: 12
});
noise('cork', {
	freq: '0.85',
	oct: 2,
	rgb: [0.28, 0.16, 0.06],
	a: [0.95, -0.28],
	size: 180,
	seed: 9
});
noise('leather', { freq: '0.3', oct: 4, a: [0.6, -0.18], size: 200, seed: 10 });
noise('slategrain', { freq: '0.9', oct: 2, rgb: [1, 1, 1], a: [0.2, -0.07], size: 200, seed: 21 });
noise('suede', {
	freq: '0.95',
	oct: 1,
	rgb: [0.55, 0.32, 0.48],
	a: [0.32, -0.1],
	size: 160,
	seed: 22
});

/* ── dark academia: a book open on a desk ──────────────────────────────── */

draw(
	'filigree',
	'0 0 200 30',
	'<path d="M100 15 C88 2 70 2 64 12 C58 22 72 26 76 18 M100 15 C112 2 130 2 136 12 C142 22 128 26 124 18 M64 12 C40 26 22 14 6 16 M136 12 C160 26 178 14 194 16" fill="none" stroke="#5c1a1b" stroke-width="1.4"/><path d="M100 8 L104 15 L100 22 L96 15 Z" fill="#5c1a1b"/>'
);

// A juvenile (climbing) ivy leaf: palmate, five pointed lobes with the middle
// one longest, a heart-shaped notch where the stalk joins, pale veins fanning
// from there to each lobe's tip.
const ivyLeaf = (x, y, scale, turn) =>
	`<g transform="translate(${x} ${y}) rotate(${turn}) scale(${scale})"><g transform="translate(0 -12)"><path d="M0 5 V12" stroke="#4a3a22" stroke-width="1.3" stroke-linecap="round"/><path d="M0 5 Q3.5 7.5 7.5 7.2 Q8.6 5 7 3.2 Q10.5 1.5 12.2 -2.2 Q8.5 -3.4 5.2 -3 Q4.6 -8.6 0 -13.5 Q-4.6 -8.6 -5.2 -3 Q-8.5 -3.4 -12.2 -2.2 Q-10.5 1.5 -7 3.2 Q-8.6 5 -7.5 7.2 Q-3.5 7.5 0 5 Z" fill="url(#ivyG)" stroke="#1d3019" stroke-width=".7" stroke-linejoin="round"/><path d="M0 4.5 L0 -11.5 M0 4.5 L10.4 -2 M0 4.5 L-10.4 -2 M0 4.5 L6.6 6.2 M0 4.5 L-6.6 6.2" stroke="#b9d29a" stroke-width=".6" opacity=".75" fill="none"/></g></g>`;
// The vine's stems as cubic curves, so each leaf's stalk meets a stem.
const IVY_STEMS = [
	[
		[4, 4],
		[22, 14],
		[30, 30],
		[32, 52]
	],
	[
		[32, 52],
		[34, 74],
		[26, 92],
		[36, 124]
	],
	[
		[4, 4],
		[30, 8],
		[58, 6],
		[90, 18]
	],
	[
		[90, 18],
		[104, 24],
		[112, 22],
		[124, 16]
	]
];
function onStem(stem, t) {
	const [a, b, c, d] = IVY_STEMS[stem];
	const u = 1 - t;
	const at = (k) =>
		u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k];
	const slope = (k) =>
		3 * u * u * (b[k] - a[k]) + 6 * u * t * (c[k] - b[k]) + 3 * t * t * (d[k] - c[k]);
	return [at(0), at(1), (Math.atan2(slope(1), slope(0)) * 180) / Math.PI];
}
// [stem, how far along it, which side, size]: each leaf points off its side of the stem.
const IVY_LEAVES = [
	[0, 0.2, 1, 1.05],
	[0, 0.62, -1, 1],
	[1, 0.12, 1, 0.9],
	[1, 0.42, -1, 0.95],
	[1, 0.72, 1, 0.8],
	[1, 0.96, -1, 0.7],
	[2, 0.32, -1, 1],
	[2, 0.72, 1, 0.95],
	[3, 0.25, -1, 0.85],
	[3, 0.8, 1, 0.7]
];
draw(
	'ivy',
	'0 0 130 130',
	`<defs><linearGradient id="ivyG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f7a3a"/><stop offset="1" stop-color="#22401f"/></linearGradient></defs><path d="M4 4 C22 14 30 30 32 52 C34 74 26 92 36 124 M4 4 C30 8 58 6 90 18 C104 24 112 22 124 16" fill="none" stroke="#4a3a22" stroke-width="2.2" stroke-linecap="round"/>${IVY_LEAVES.map(
		([stem, t, side, size]) => {
			const [x, y, angle] = onStem(stem, t);
			return ivyLeaf(fixed(x), fixed(y), size, (angle + 90 + side * 55).toFixed(0));
		}
	).join('')}`
);

// A rose pressed side-on in a book: a flattened bud faded to dusty rose and
// mauve, browning at the edges, with sepals, a thorned stem and two serrated
// leaves gone olive, and a faint tea-coloured shadow left on the page.
function serratedLeaf(cx, cy, length, wide, turn) {
	const points = [];
	for (let i = 0; i <= 28; i += 1) {
		const angle = (i / 28) * Math.PI * 2;
		const tooth = i % 2 ? 0.86 : 1;
		const px = Math.sin(angle) * wide * tooth * (1 - 0.35 * Math.max(0, -Math.cos(angle)));
		const py = -Math.cos(angle) * length * (i % 2 ? 0.97 : 1);
		points.push(`${fixed(cx + px)},${fixed(cy + py)}`);
	}
	return `<g transform="rotate(${turn} ${cx} ${cy + length})"><polygon points="${points.join(' ')}" fill="#8a8558" stroke="#5a5630" stroke-width=".6"/><path d="M${cx} ${cy + length} V${cy - length * 0.9}" stroke="#5a5630" stroke-width=".7"/></g>`;
}
draw(
	'pressed-rose',
	'0 0 100 140',
	`<defs><filter id="pressStain" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter></defs><ellipse cx="52" cy="60" rx="30" ry="40" fill="#8a5a2a" opacity=".14" filter="url(#pressStain)"/><path d="M50 56 C51 80 54 104 64 136" fill="none" stroke="#6b6438" stroke-width="2.4" stroke-linecap="round"/><path d="M52 78 l4 -2 l-3.4 3.6 Z M54 98 l-4 -1 l3.6 3 Z M58 116 l4 -2.4 l-3.2 3.8 Z" fill="#6b6438"/>${serratedLeaf(52.8, 75, 10, 6, 50)}${serratedLeaf(55.6, 96, 9, 5.5, -55)}<g stroke="#6a4636" stroke-width=".7" stroke-linejoin="round"><path d="M50 52 C40 48 38 30 45 19 C49 14 54 14 57 19 C63 30 61 48 50 52 Z" fill="#86675c"/><path d="M50 54 C36 54 26 42 28 29 C31 25 37 28 41 32 C45 38 48 46 50 54 Z" fill="#ae958a"/><path d="M50 54 C64 54 74 42 72 29 C69 25 63 28 59 32 C55 38 52 46 50 54 Z" fill="#a2887e"/><path d="M50 57 C39 55 33 46 35 37 C41 41 46 39 50 34 C54 39 59 41 65 37 C67 46 61 55 50 57 Z" fill="#c0a89a"/></g><path d="M45 19 C49 14 54 14 57 19 M28 29 C31 25 37 28 41 32 M72 29 C69 25 63 28 59 32 M35 37 C41 41 46 39 50 34 C54 39 59 41 65 37" fill="none" stroke="#7a4a2a" stroke-width="1.6" opacity=".55"/><path d="M50 50 C48 40 48 30 50 22 M40 48 C36 42 33 36 32 31 M60 48 C64 42 67 36 68 31" fill="none" stroke="#6e2a30" stroke-width=".5" opacity=".5"/><path d="M50 56 C44 58 38 62 33 66 C39 60 44 56 48 54 Z M50 56 C56 58 62 62 67 66 C61 60 56 56 52 54 Z M50 57 C49 62 49 66 50 70 C51 66 51 62 50 57 Z" fill="#76704a"/><ellipse cx="50" cy="56.5" rx="4" ry="2.6" fill="#6b6438"/>`
);

// An ink blot on absorbent paper: a near-black core, a paler halo feathering
// into the fibres, and a few droplets, each with a tail pointing away from
// where the drop struck.
function inkBlot() {
	const random = seeded(41);
	const blob = (cx, cy, radius, wobble) => {
		const phase = random() * 6;
		const phase2 = random() * 6;
		const points = [];
		for (let i = 0; i < 36; i += 1) {
			const angle = (i / 36) * Math.PI * 2;
			const reach =
				radius *
				(1 +
					wobble * (0.6 * Math.sin(3 * angle + phase) + 0.4 * Math.sin(5 * angle + phase2)) +
					(random() - 0.5) * 0.08);
			points.push([cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach * 0.85]);
		}
		let path = `M${fixed((points[0][0] + points[35][0]) / 2)} ${fixed((points[0][1] + points[35][1]) / 2)}`;
		for (let i = 0; i < 36; i += 1) {
			const [x, y] = points[i];
			const [nx, ny] = points[(i + 1) % 36];
			path += ` Q${fixed(x)} ${fixed(y)} ${fixed((x + nx) / 2)} ${fixed((y + ny) / 2)}`;
		}
		return `${path} Z`;
	};
	const drops = [
		[78, 18, 3.2, 30],
		[84, 46, 2, -10],
		[14, 52, 2.6, 200],
		[26, 12, 1.4, 240],
		[70, 58, 1.2, 50]
	]
		.map(
			([x, y, r, turn]) =>
				`<g transform="rotate(${turn} ${x} ${y})"><circle cx="${x}" cy="${y}" r="${r}"/><path d="M${x + r * 0.6} ${y - r * 0.5} Q${x + r * 2.6} ${y} ${x + r * 0.6} ${y + r * 0.5} Z"/></g>`
		)
		.join('');
	return `<defs><filter id="inkFeather" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9"/></filter><filter id="inkEdge" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="8" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.4"/></filter><radialGradient id="inkCore" cx=".45" cy=".45" r=".6"><stop offset="0" stop-color="#0e0a08"/><stop offset=".7" stop-color="#1a130e"/><stop offset="1" stop-color="#2c2018"/></radialGradient></defs><path d="${blob(48, 36, 25, 0.16)}" fill="#3a2a1e" opacity=".42" filter="url(#inkFeather)"/><path d="${blob(47, 35, 19, 0.18)}" fill="url(#inkCore)" filter="url(#inkEdge)"/><path d="${blob(44, 31, 5, 0.2)}" fill="#fff" opacity=".07"/><g fill="#1a130e" filter="url(#inkEdge)">${drops}</g>`;
}
draw('ink-blot', '0 0 100 70', inkBlot());

// A grosgrain bookmark: edges not quite parallel, woven ribs across it, an
// off-centre sheen, and an uneven V-cut end with a few frayed threads.
draw(
	'ribbon',
	'6.5 0 15 170',
	'<defs><linearGradient id="ribbonG" x1="0" x2="1"><stop offset="0" stop-color="#3a0a0d"/><stop offset=".18" stop-color="#651a1d"/><stop offset=".38" stop-color="#8e2e31"/><stop offset=".5" stop-color="#7a2326"/><stop offset=".78" stop-color="#5a1518"/><stop offset="1" stop-color="#360a0c"/></linearGradient><pattern id="ribs" width="6" height="1.5" patternUnits="userSpaceOnUse"><rect width="6" height=".5" fill="#000" opacity=".1"/></pattern><clipPath id="ribbonClip"><path d="M8 0 C7 40 10.5 80 8.5 120 C7.5 140 8.5 152 7.6 163 L11.5 158 L14.6 151 L17.4 157.5 L20.6 164 C21.4 152 20.6 140 21.2 120 C23 80 19.6 40 21 0 Z"/></clipPath></defs><g clip-path="url(#ribbonClip)"><rect width="30" height="170" fill="url(#ribbonG)"/><rect width="30" height="170" fill="url(#ribs)"/></g><path d="M8 0 C7 40 10.5 80 8.5 120 C7.5 140 8.5 152 7.6 163 M21 0 C19.6 40 23 80 21.2 120 C20.6 140 21.4 152 20.6 164" fill="none" stroke="#2a0608" stroke-width=".6" opacity=".7"/><path d="M8.4 162 l-.8 3.2 M9.6 160.6 l-.3 3.4 M19.4 162.4 l.6 3.4 M20.2 163.4 l1 2.8 M13.8 152.4 l.2 2.4" stroke="#6e1c1f" stroke-width=".45" stroke-linecap="round"/>'
);

/* ── L'ardoise: a slate wiped with a damp cloth ────────────────────────── */

draw(
	'swipes',
	'0 0 600 800',
	'<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter><filter id="g"><feGaussianBlur stdDeviation="1.6"/></filter><g filter="url(#b)" fill="none" stroke="#fff" stroke-linecap="round"><path d="M-30 150 Q300 50 640 190" stroke-width="80" opacity=".05"/><path d="M-40 420 Q260 320 640 470" stroke-width="100" opacity=".035"/><path d="M40 720 Q320 610 660 700" stroke-width="70" opacity=".05"/><path d="M380 300 a120 60 -10 1 0 1 0" stroke-width="40" opacity=".03"/></g><g filter="url(#g)" fill="#fff" font-family="cursive" opacity=".05"><text x="70" y="590" font-size="58" transform="rotate(-4 70 590)">soupe à l’oignon</text><text x="300" y="250" font-size="40" transform="rotate(3 300 250)">12€</text></g>',
	'width="600" height="800" preserveAspectRatio="none"'
);
const chalk = '#f1efe6';
draw(
	'cloche',
	'0 0 80 60',
	`<g fill="none" stroke="${chalk}" stroke-linecap="round" stroke-linejoin="round"><path d="M10 46 Q10 16 40 15 Q70 16 70 46 Z" stroke-width="2.4"/><path d="M18 38 Q19 26 30 21" stroke-width="1.6"/><circle cx="40" cy="11" r="3.5" stroke-width="2"/><path d="M3 48 H77" stroke-width="2.6"/><path d="M4 8 L10 12 M76 8 L70 12 M40 0 V3" stroke-width="1.6"/></g>`
);
draw(
	'flourish',
	'0 0 64 26',
	'<path d="M62 13 C48 13 44 3 34 6 C25 9 28 19 34 16 C38 14 36 9 31 10 M34 6 C22 15 12 17 2 13 M18 15 C14 20 8 21 6 19" fill="none" stroke="#f5bccb" stroke-width="2" stroke-linecap="round"/>'
);
draw(
	'banner',
	'0 0 200 44',
	'<g fill="none" stroke="#f6d98f" stroke-linejoin="round"><path d="M24 12 H4 L13 23 L4 34 H24 M176 12 H196 L187 23 L196 34 H176" stroke-width="2"/><path d="M22 6 Q100 12 178 6 V30 Q100 36 22 30 Z" stroke-width="2.4"/><path d="M22 30 L26 36 M178 30 L174 36" stroke-width="1.6"/></g>'
);
// A box drawn twice by hand, slightly off, the way one is drawn on a blackboard.
draw(
	'chalk-box',
	'0 0 100 100',
	`<path d="M3 6 C30 3 70 5 97 4 C96 30 98 70 96 95 C70 97 30 96 4 97 C2 70 4 30 3 6 Z" fill="none" stroke="${chalk}" stroke-width="2.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><path d="M5 3 C35 6 68 2 95 7 C99 35 94 68 98 93 C68 99 33 94 2 95 C5 65 1 34 5 3" fill="none" stroke="${chalk}" stroke-width="1.4" opacity=".55" vector-effect="non-scaling-stroke"/>`,
	'preserveAspectRatio="none"'
);
draw(
	'rope',
	'0 0 50 50',
	`<path d="M25 25 m-3 0 a3 3 0 1 1 6 0 a7 7 0 1 1 -14 0 a11 11 0 1 1 22 0 a15 15 0 1 1 -30 0 a19 19 0 1 1 38 0" fill="none" stroke="${chalk}" stroke-width="2.4" stroke-linecap="round"/>`
);

/* ── Deco lounge ───────────────────────────────────────────────────────── */

const gold = '#c8a24a';
draw(
	'sunburst',
	'0 0 200 64',
	`${repeat(17, (i) => {
		const angle = Math.PI + (i * Math.PI) / 16;
		const reach = i % 2 ? 50 : 60;
		return `<line x1="${fixed(100 + 16 * Math.cos(angle))}" y1="${fixed(62 + 16 * Math.sin(angle))}" x2="${fixed(100 + reach * Math.cos(angle))}" y2="${fixed(62 + reach * Math.sin(angle))}" stroke="${gold}" stroke-width="${i % 2 ? 1 : 2}"/>`;
	})}<path d="M84 62 A16 16 0 0 1 116 62 Z" fill="${gold}"/><path d="M30 62 H170" stroke="${gold}" stroke-width="1.5"/>`
);
draw(
	'deco-corner',
	'0 0 40 40',
	`<path d="M0 0 H40 V2 H2 V40 H0 Z M6 6 H26 V8 H8 V26 H6 Z" fill="${gold}"/><path d="M8 8 L18 18" stroke="${gold}" stroke-width="1.4"/><circle cx="20" cy="20" r="2.4" fill="${gold}"/>`
);
const GLASSES = [
	'<path d="M4 8 Q20 24 36 8 Z" fill="none"/><path d="M20 18 V44 M10 46 H30" fill="none"/>',
	`<path d="M4 6 L20 24 L36 6 Z" fill="none"/><path d="M20 24 V44 M10 46 H30"/><circle cx="26" cy="12" r="2.5" fill="${gold}" stroke="none"/>`,
	'<path d="M8 12 H32 L30 44 H10 Z" fill="none"/><rect x="14" y="26" width="9" height="9" fill="none" stroke-width="1.5" transform="rotate(12 18 30)"/>',
	'<path d="M10 10 Q4 28 20 32 Q36 28 30 10 Z" fill="none"/><path d="M20 32 V44 M12 46 H28"/>'
];
for (const [index, body] of GLASSES.entries()) {
	draw(`glass-${index + 1}`, '0 0 40 50', `<g stroke="${gold}" stroke-width="2">${body}</g>`);
}

/* ── Trattoria ─────────────────────────────────────────────────────────── */

draw(
	'olive',
	'0 0 160 40',
	`<path d="M6 30 Q80 2 154 22" fill="none" stroke="#5d7a3a" stroke-width="2"/>${[
		20, 40, 60, 80, 100, 120, 140
	]
		.map(
			(x, i) =>
				`<ellipse cx="${x}" cy="${i % 2 ? 26 : 12}" rx="10" ry="3.6" transform="rotate(${i % 2 ? 25 : -25} ${x} ${i % 2 ? 26 : 12})" fill="#5d7a3a" opacity=".85"/>`
		)
		.join(
			''
		)}<circle cx="52" cy="30" r="4.5" fill="#2f3d1e"/><circle cx="112" cy="9" r="4.5" fill="#2f3d1e"/>`
);
draw(
	'wine-ring',
	'0 0 100 100',
	'<circle cx="50" cy="50" r="40" fill="none" stroke="#7a1a2a" stroke-width="5" stroke-dasharray="180 12 60 8"/><circle cx="50" cy="50" r="36" fill="none" stroke="#7a1a2a" stroke-width="1.5" opacity=".6"/>'
);

/* ── Dungeon board ─────────────────────────────────────────────────────── */

draw(
	'chain',
	'0 0 16 64',
	`<defs><linearGradient id="iron" x1="0" x2="1"><stop offset="0" stop-color="#3a3836"/><stop offset=".45" stop-color="#9a958e"/><stop offset="1" stop-color="#2a2826"/></linearGradient></defs>${repeat(
		5,
		(i) =>
			`<rect x="${i % 2 ? 6 : 2.5}" y="${i * 12.5}" width="${i % 2 ? 4 : 11}" height="15" rx="${i % 2 ? 2 : 5.5}" fill="none" stroke="url(#iron)" stroke-width="2.8"/>`
	)}`,
	'preserveAspectRatio="none"'
);
// The flame flickers unless the person has asked for less motion; an SVG
// used as an image still sees that media query.
draw(
	'candle',
	'0 0 30 80',
	'<style>@media (prefers-reduced-motion: no-preference) { .flame { transform-origin: 15px 28px; animation: flicker 1.6s ease-in-out infinite alternate; } } @keyframes flicker { from { transform: scale(1, 1) rotate(-2deg); } to { transform: scale(.9, 1.12) rotate(2deg); } }</style><g class="flame"><path d="M15 6 Q22 18 15 28 Q8 18 15 6 Z" fill="#ffcf5c"/><path d="M15 14 Q18 20 15 26 Q12 20 15 14 Z" fill="#fff6d0"/></g><circle cx="15" cy="20" r="13" fill="#ffb347" opacity=".2"/><line x1="15" y1="26" x2="15" y2="30" stroke="#222" stroke-width="1.2"/><rect x="9" y="29" width="12" height="43" rx="2" fill="#efe3c8"/><path d="M9 30 Q9 42 11 44 Q13 42 12 34 Q15 40 16 37 Q18 46 20 44 Q21 38 21 30 Z" fill="#d8c8a4"/><rect x="4" y="72" width="22" height="6" rx="2" fill="#3a3330"/>'
);
draw(
	'rivets',
	'0 0 40 12',
	'<radialGradient id="r" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#9a948d"/><stop offset=".55" stop-color="#9a948d"/><stop offset=".7" stop-color="#2a2826"/><stop offset="1" stop-color="#2a2826" stop-opacity="0"/></radialGradient><circle cx="10" cy="6" r="3.5" fill="url(#r)"/>',
	'width="40" height="12"'
);

/* ── Glossy cover ──────────────────────────────────────────────────────── */

const sparkle = (cx, cy, r) => {
	const k = r * 0.16;
	return `M ${cx} ${cy - r} Q ${cx + k} ${cy - k} ${cx + r} ${cy} Q ${cx + k} ${cy + k} ${cx} ${cy + r} Q ${cx - k} ${cy + k} ${cx - r} ${cy} Q ${cx - k} ${cy - k} ${cx} ${cy - r} Z`;
};
draw(
	'lips',
	'0 0 100 60',
	`<path d="M5 30 Q25 6 42 16 Q50 20 58 16 Q75 6 95 30 Q75 34 50 34 Q25 34 5 30 Z" fill="#d6004f"/><path d="M5 30 Q25 34 50 34 Q75 34 95 30 Q78 56 50 56 Q22 56 5 30 Z" fill="#b8003f"/><path d="M15 31 Q50 38 85 31" stroke="#7a0029" stroke-width="2" fill="none"/>${[20, 35, 50, 65, 80].map((x) => `<path d="M${x} 40 l2 8" stroke="#7a0029" stroke-width="1" opacity=".5"/>`).join('')}`
);
draw(
	'burst',
	'0 0 100 100',
	`<polygon points="${repeat(24, (i) => {
		const r = i % 2 ? 40 : 50;
		const angle = (i * Math.PI) / 12;
		return `${fixed(50 + r * Math.cos(angle))},${fixed(50 + r * Math.sin(angle))} `;
	})}" fill="#fff2a8"/>`
);
const heartBottle =
	'M60 162 C20 134 6 108 8 86 C10 64 30 52 46 56 C50 57 52 58 52 60 H68 C68 58 70 57 74 56 C90 52 110 64 112 86 C114 108 100 134 60 162 Z';
// A heart-shaped perfume bottle: the neck rises from a flat shoulder, so cap,
// neck and body read as one bottle, with a satin bow tied round the neck.
draw(
	'perfume',
	'0 0 120 170',
	`<defs><linearGradient id="capG" x1="0" x2="1"><stop offset="0" stop-color="#a4782c"/><stop offset=".35" stop-color="#fbe7a6"/><stop offset=".6" stop-color="#c99a3c"/><stop offset="1" stop-color="#7a5418"/></linearGradient><linearGradient id="juice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7cbc"/><stop offset="1" stop-color="#b3005f"/></linearGradient><linearGradient id="satinBow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff86bf"/><stop offset="1" stop-color="#e2007a"/></linearGradient><clipPath id="heartClip"><path d="${heartBottle}"/></clipPath></defs><rect x="52" y="34" width="16" height="28" fill="#ffd2e6" stroke="#fff" stroke-width="2"/><rect x="49" y="12" width="22" height="22" rx="4" fill="url(#capG)"/><path d="M54 14 V32 M66 14 V32" stroke="rgba(255,255,255,.35)" stroke-width="1.6"/><rect x="48" y="31" width="24" height="5" rx="2" fill="#b8892f"/><path d="${heartBottle}" fill="rgba(255,240,248,.45)"/><g clip-path="url(#heartClip)"><rect x="0" y="84" width="120" height="90" fill="url(#juice)"/><path d="M0 84 Q30 78 60 84 T120 84" fill="#ff9ccc"/></g><path d="${heartBottle}" fill="none" stroke="#fff" stroke-width="3"/><path d="M20 90 C20 76 28 68 40 66" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/><ellipse cx="92" cy="122" rx="4" ry="9" transform="rotate(30 92 122)" fill="#fff" opacity=".5"/><g stroke="#b0005a" stroke-width="1.2" stroke-linejoin="round"><path d="M57 49 L48 74 L52 71 L55 76 L61 51 Z M63 49 L72 74 L68 71 L65 76 L59 51 Z" fill="#e2007a"/><path d="M57 47 C48 36 34 37 34 46 C34 55 48 55 57 49 Z" fill="url(#satinBow)"/><path d="M63 47 C72 36 86 37 86 46 C86 55 72 55 63 49 Z" fill="url(#satinBow)"/></g><path d="M55 47.5 C49 44 42 44 39 47 M65 47.5 C71 44 78 44 81 47" fill="none" stroke="#b0005a" stroke-width="1.2" opacity=".7"/><path d="M38 43 C41 40 46 40 49 42 M82 43 C79 40 74 40 71 42" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".55"/><rect x="55.5" y="43.5" width="9" height="9" rx="3" fill="#ff5fa8" stroke="#b0005a" stroke-width="1.2"/><g fill="#fff">${[
		[12, 40, 6],
		[104, 30, 8],
		[110, 148, 5],
		[16, 150, 4]
	]
		.map(([x, y, r]) => `<path d="${sparkle(x, y, r)}"/>`)
		.join('')}</g>`
);

/* ── Club ticket and nutrition facts ───────────────────────────────────── */

{
	let bars = '';
	let x = 0;
	for (const [i, width] of [
		2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1
	].entries()) {
		if (i % 2 === 0) {
			bars += `<rect x="${x}" y="0" width="${width}" height="30" fill="#f2f2f2"/>`;
		}
		x += width;
	}
	draw('barcode', `0 0 ${x} 30`, bars, 'preserveAspectRatio="none"');
}
draw(
	'recycle',
	'0 0 36 40',
	'<path d="M6 34 L18 8 L30 34 Z M12 34 L18 22 L24 34" fill="none" stroke="#2a1b0b" stroke-width="2"/>'
);

/* ── Pet play ──────────────────────────────────────────────────────────── */

// A puppy in a pup hood's colours: blue, white brows and muzzle, floppy
// pink-lined ears and blushing cheeks.
draw(
	'pup',
	'0 0 100 100',
	'<ellipse cx="18" cy="52" rx="13" ry="24" transform="rotate(18 18 52)" fill="#2d58b8"/><ellipse cx="82" cy="52" rx="13" ry="24" transform="rotate(-18 82 52)" fill="#2d58b8"/><ellipse cx="18" cy="55" rx="7" ry="16" transform="rotate(18 18 55)" fill="#f6a9c4"/><ellipse cx="82" cy="55" rx="7" ry="16" transform="rotate(-18 82 55)" fill="#f6a9c4"/><circle cx="50" cy="52" r="33" fill="#4a7de0"/><path d="M28 40 Q36 30 44 38 M56 38 Q64 30 72 40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><ellipse cx="38" cy="50" rx="5" ry="6.5" fill="#1d2440"/><ellipse cx="62" cy="50" rx="5" ry="6.5" fill="#1d2440"/><circle cx="40" cy="47.5" r="1.8" fill="#fff"/><circle cx="64" cy="47.5" r="1.8" fill="#fff"/><ellipse cx="50" cy="68" rx="19" ry="14" fill="#fff"/><path d="M44 61 Q50 57 56 61 Q56 66 50 68 Q44 66 44 61 Z" fill="#1d2440"/><path d="M50 68 V72 M42 72 Q50 78 58 72" fill="none" stroke="#1d2440" stroke-width="2" stroke-linecap="round"/><path d="M46 75 Q50 86 54 75 Z" fill="#ff7aa2"/><circle cx="28" cy="62" r="4" fill="#ff9cbc" opacity=".7"/><circle cx="72" cy="62" r="4" fill="#ff9cbc" opacity=".7"/>'
);
draw(
	'paws',
	'0 0 80 80',
	'<g fill="#fff" opacity=".55"><g transform="translate(10 8) scale(.45) rotate(-15 20 20)"><ellipse cx="20" cy="27" rx="9" ry="8"/><circle cx="9" cy="16" r="4"/><circle cx="16" cy="9" r="4"/><circle cx="25" cy="9" r="4"/><circle cx="31" cy="16" r="4"/></g><g transform="translate(46 50) scale(.55) rotate(25 20 10)"><rect x="8" y="7" width="24" height="6" rx="2"/><circle cx="8" cy="6" r="4.5"/><circle cx="8" cy="14" r="4.5"/><circle cx="32" cy="6" r="4.5"/><circle cx="32" cy="14" r="4.5"/></g><circle cx="62" cy="14" r="2"/><circle cx="18" cy="60" r="2.5"/></g>',
	'width="80" height="80"'
);
// Masks, recoloured by each card.
draw(
	'paw',
	'0 0 40 40',
	'<ellipse cx="20" cy="27" rx="9" ry="8"/><circle cx="9" cy="16" r="4"/><circle cx="16" cy="9" r="4"/><circle cx="25" cy="9" r="4"/><circle cx="31" cy="16" r="4"/>'
);
// One bone and a sliver of gap, so a run of them tiles.
draw(
	'bone',
	'0 0 42 20',
	'<rect x="8" y="7" width="24" height="6" rx="2"/><circle cx="8" cy="6" r="4.5"/><circle cx="8" cy="14" r="4.5"/><circle cx="32" cy="6" r="4.5"/><circle cx="32" cy="14" r="4.5"/>'
);
// A toy on each card's corner: a tennis ball, a food bowl, a chew bone, a cushion.
draw(
	'pet-ball',
	'0 0 50 50',
	'<circle cx="25" cy="25" r="20" fill="#d9ef5c" stroke="#fff" stroke-width="3"/><path d="M8 16 Q22 25 8 36 M42 16 Q28 25 42 36" fill="none" stroke="#fff" stroke-width="2.6"/>'
);
draw(
	'pet-bowl',
	'0 0 60 44',
	'<path d="M4 18 H56 L50 40 H10 Z" fill="#7ac9a0" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><ellipse cx="30" cy="18" rx="26" ry="6" fill="#bfe8cf" stroke="#fff" stroke-width="3"/><path d="M30 34 C24 30 22 26 26 24 C28 23 30 25 30 26 C30 25 32 23 34 24 C38 26 36 30 30 34 Z" fill="#fff"/>'
);
draw(
	'pet-bone',
	'0 0 60 34',
	'<g fill="#ffe29a" stroke="#fff" stroke-width="3" paint-order="stroke"><circle cx="11" cy="10" r="7"/><circle cx="11" cy="24" r="7"/><circle cx="49" cy="10" r="7"/><circle cx="49" cy="24" r="7"/><rect x="11" y="12" width="38" height="10" rx="3"/></g><g fill="#ffe29a"><circle cx="11" cy="10" r="7"/><circle cx="11" cy="24" r="7"/><circle cx="49" cy="10" r="7"/><circle cx="49" cy="24" r="7"/><rect x="11" y="12" width="38" height="10" rx="3"/></g>'
);
draw(
	'pet-cushion',
	'0 0 60 44',
	'<rect x="4" y="10" width="52" height="30" rx="14" fill="#c5b4f2" stroke="#fff" stroke-width="3"/><rect x="12" y="16" width="36" height="16" rx="8" fill="#e4dbfb"/><path d="M30 30 C25 27 23 23 26 21 C28 20 30 22 30 23 C30 22 32 20 34 21 C37 23 35 27 30 30 Z" fill="#f6a9c4"/>'
);

// The tag on the pet's collar: a gold heart on a ring, a paw pressed into
// it, outlined in white like the toys.
draw(
	'pet-tag',
	'0 0 44 52',
	'<circle cx="22" cy="7" r="5" fill="none" stroke="#fff" stroke-width="5"/><circle cx="22" cy="7" r="5" fill="none" stroke="#c9a227" stroke-width="2.4"/><path d="M22 48 C8 38 3 30 3 22 C3 15 8 11 13 11 C17 11 20 13 22 16 C24 13 27 11 31 11 C36 11 41 15 41 22 C41 30 36 38 22 48 Z" fill="#ffd84d" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><g fill="#e0a800"><ellipse cx="22" cy="30" rx="5" ry="4.2"/><circle cx="15.5" cy="24" r="2.2"/><circle cx="19.5" cy="20.5" r="2.2"/><circle cx="24.5" cy="20.5" r="2.2"/><circle cx="28.5" cy="24" r="2.2"/></g>'
);
// More for a card's corner, to pick from: a frisbee, a tug rope, a squeaky
// duck, a biscuit, and for a kitty a ball of yarn, a toy mouse, a fish and
// a feather wand. In the same pastels, outlined in white.
draw(
	'pet-frisbee',
	'0 0 56 44',
	'<ellipse cx="28" cy="24" rx="24" ry="14" fill="#ff8fa3" stroke="#fff" stroke-width="3"/><ellipse cx="28" cy="21" rx="14" ry="7" fill="#ffc2cd"/><path d="M14 30 Q28 36 42 30" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>'
);
draw(
	'pet-rope',
	'0 0 64 36',
	'<path d="M10 18 H54" stroke="#fff" stroke-width="13" stroke-linecap="round"/><path d="M10 18 H54" stroke="#e9a35c" stroke-width="8" stroke-linecap="round"/><path d="M16 13 L20 23 M24 13 L28 23 M32 13 L36 23 M40 13 L44 23" stroke="#fff3df" stroke-width="2.4" stroke-linecap="round"/><circle cx="7" cy="18" r="6" fill="#7ac9a0" stroke="#fff" stroke-width="3"/><circle cx="57" cy="18" r="6" fill="#7ac9a0" stroke="#fff" stroke-width="3"/>'
);
draw(
	'pet-duck',
	'0 0 56 50',
	'<g stroke="#fff" stroke-width="3" stroke-linejoin="round"><path d="M8 30 Q8 46 28 46 Q48 46 48 32 Q48 24 40 24 Q34 24 30 28 Q20 22 8 30 Z" fill="#ffd84d"/><circle cx="36" cy="16" r="11" fill="#ffd84d"/><path d="M46 15 L55 18 L46 21 Z" fill="#ff9a3c"/></g><circle cx="39" cy="13" r="2.2" fill="#2d3550"/><path d="M14 34 Q22 30 30 36" fill="none" stroke="#f2b92c" stroke-width="2.4" stroke-linecap="round"/>'
);
draw(
	'pet-biscuit',
	'0 0 60 34',
	'<path d="M14 4 C6 4 3 11 7 17 C3 23 6 30 14 30 C19 30 21 27 22 25 H38 C39 27 41 30 46 30 C54 30 57 23 53 17 C57 11 54 4 46 4 C41 4 39 7 38 9 H22 C21 7 19 4 14 4 Z" fill="#d99a5b" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><g fill="#a86a32"><circle cx="24" cy="15" r="1.6"/><circle cx="30" cy="19" r="1.6"/><circle cx="36" cy="15" r="1.6"/></g>'
);
draw(
	'pet-yarn',
	'0 0 54 50',
	'<circle cx="25" cy="25" r="19" fill="#ff8fc8" stroke="#fff" stroke-width="3"/><g fill="none" stroke="#ffd1ea" stroke-width="2.2" stroke-linecap="round"><path d="M10 18 Q25 28 38 10"/><path d="M8 28 Q26 36 42 16"/><path d="M14 40 Q30 40 44 26"/><path d="M20 8 Q14 24 22 43"/></g><path d="M42 36 Q50 40 46 46 Q42 50 50 49" fill="none" stroke="#ff8fc8" stroke-width="2.6" stroke-linecap="round"/>'
);
draw(
	'pet-mouse',
	'0 0 60 40',
	'<path d="M6 30 Q-2 38 8 37 Q14 36 12 31" fill="none" stroke="#c5b4f2" stroke-width="2.6" stroke-linecap="round"/><g stroke="#fff" stroke-width="3" stroke-linejoin="round"><path d="M10 30 Q14 10 36 10 Q52 12 56 28 Q46 32 10 30 Z" fill="#b9b3c9"/><circle cx="36" cy="10" r="7" fill="#b9b3c9"/></g><circle cx="36" cy="10" r="3.5" fill="#f6a9c4"/><circle cx="48" cy="21" r="2" fill="#2d3550"/><circle cx="56" cy="27" r="2.2" fill="#f6a9c4"/>'
);
draw(
	'pet-fish',
	'0 0 62 36',
	'<g stroke="#fff" stroke-width="3" stroke-linejoin="round"><path d="M6 18 Q22 2 42 8 Q52 12 56 18 Q52 24 42 28 Q22 34 6 18 Z" fill="#6cc3f2"/><path d="M8 18 L1 8 L1 28 Z" fill="#6cc3f2"/></g><circle cx="46" cy="16" r="2.4" fill="#2d3550"/><path d="M24 11 Q28 18 24 25 M31 10 Q35 18 31 26" fill="none" stroke="#bfe6fb" stroke-width="2.2" stroke-linecap="round"/>'
);
draw(
	'pet-feather',
	'0 0 50 56',
	'<path d="M6 52 L26 20" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M6 52 L26 20" stroke="#c5b4f2" stroke-width="3" stroke-linecap="round"/><g stroke="#fff" stroke-width="3" stroke-linejoin="round"><path d="M26 22 Q22 6 40 2 Q46 14 30 26 Z" fill="#7ac9a0"/><path d="M28 24 Q40 14 48 22 Q40 34 28 26 Z" fill="#ff8fc8"/></g><path d="M27 23 L40 6 M29 25 L45 21" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>'
);
// A kitten in a kitten hood's colours, a pair to the pup: lilac, pointed
// pink-lined ears, white brows and muzzle, whiskers and blushing cheeks.
draw(
	'kitty',
	'0 0 100 100',
	'<path d="M20 44 L18 10 L46 26 Z" fill="#7b55c9" stroke="#7b55c9" stroke-width="4" stroke-linejoin="round"/><path d="M80 44 L82 10 L54 26 Z" fill="#7b55c9" stroke="#7b55c9" stroke-width="4" stroke-linejoin="round"/><path d="M24 36 L23 18 L38 27 Z" fill="#f6a9c4"/><path d="M76 36 L77 18 L62 27 Z" fill="#f6a9c4"/><circle cx="50" cy="54" r="33" fill="#9b78e6"/><path d="M30 42 Q37 34 44 40 M56 40 Q63 34 70 42" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><ellipse cx="38" cy="52" rx="5" ry="7" fill="#1d2440"/><ellipse cx="62" cy="52" rx="5" ry="7" fill="#1d2440"/><circle cx="40" cy="49" r="1.8" fill="#fff"/><circle cx="64" cy="49" r="1.8" fill="#fff"/><ellipse cx="50" cy="69" rx="16" ry="11" fill="#fff"/><path d="M46 63 H54 L50 67.5 Z" fill="#ff7aa2" stroke="#ff7aa2" stroke-width="2" stroke-linejoin="round"/><path d="M50 67.5 V70 M43 71 Q46.5 75 50 70 Q53.5 75 57 71" fill="none" stroke="#1d2440" stroke-width="2" stroke-linecap="round"/><g stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M33 66 L12 62 M33 70 L13 72"/><path d="M67 66 L88 62 M67 70 L87 72"/></g><circle cx="28" cy="62" r="4" fill="#ff9cbc" opacity=".7"/><circle cx="72" cy="62" r="4" fill="#ff9cbc" opacity=".7"/>'
);
// The kitty's sky: paws and fish rather than bones.
draw(
	'kitty-paws',
	'0 0 80 80',
	'<g fill="#fff" opacity=".55"><g transform="translate(10 8) scale(.45) rotate(-15 20 20)"><ellipse cx="20" cy="27" rx="9" ry="8"/><circle cx="9" cy="16" r="4"/><circle cx="16" cy="9" r="4"/><circle cx="25" cy="9" r="4"/><circle cx="31" cy="16" r="4"/></g><g transform="translate(44 50) scale(.55) rotate(25 20 10)"><path d="M4 10 Q14 0 28 4 Q34 7 36 10 Q34 13 28 16 Q14 20 4 10 Z"/><path d="M5 10 L0 3 L0 17 Z"/></g><circle cx="62" cy="14" r="2"/><circle cx="18" cy="60" r="2.5"/></g>',
	'width="80" height="80"'
);
// A fish, a mask for a kitty's rating, as a bone is a pup's.
draw(
	'fish',
	'0 0 42 20',
	'<path d="M8 10 Q18 1 30 4 Q36 6 38 10 Q36 14 30 16 Q18 19 8 10 Z"/><path d="M9 10 L2 4 L2 16 Z"/>'
);

/* ── Love letter and royal decree ──────────────────────────────────────── */

function waxSeal(name, letter, color) {
	const points = repeat(30, (i) => {
		const r =
			44 +
			pick(i % 3 === 0 ? 0 : 1 + (i % 2), [
				[1, 5],
				[2, 1],
				[3, -2]
			]);
		const angle = (i * Math.PI * 2) / 30;
		return `${fixed(50 + r * Math.cos(angle))},${fixed(50 + r * Math.sin(angle))} `;
	});
	draw(
		name,
		'0 0 100 100',
		`<defs><radialGradient id="wax" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#e4566a"/><stop offset=".4" stop-color="${color}"/><stop offset="1" stop-color="#4a0710"/></radialGradient></defs><polygon points="${points}" fill="url(#wax)"/><circle cx="50" cy="50" r="31" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="3"/><circle cx="50" cy="50" r="28" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"/><text x="50" y="63" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="38" fill="rgba(0,0,0,.4)">${letter}</text><ellipse cx="36" cy="30" rx="10" ry="5" fill="rgba(255,255,255,.22)" transform="rotate(-30 36 30)"/>`
	);
}
waxSeal('seal-letter', 'A', '#9b1b2a');
waxSeal('seal-royal', 'R', '#5a1e72');
draw(
	'rose',
	'0 0 100 100',
	'<path d="M50 52 Q46 80 40 98" stroke="#3f5a2a" stroke-width="3" fill="none"/><ellipse cx="38" cy="74" rx="10" ry="4" transform="rotate(-30 38 74)" fill="#4f6e33"/><circle cx="50" cy="40" r="16" fill="#7a1626"/><path d="M50 40 m-4 0 a4 4 0 1 1 8 0 a8 8 0 1 1 -16 0 a12 12 0 1 1 24 0" fill="none" stroke="#4a0a14" stroke-width="2"/>'
);
// A deckled edge, jittered all the way round, as a mask the paper is cut by.
{
	const random = seeded(17);
	const points = [];
	for (let i = 0; i <= 40; i += 1) {
		points.push(`${i * 25} ${fixed(random() * 6)}`);
	}
	for (let i = 0; i <= 40; i += 1) {
		points.push(`${fixed(1000 - random() * 6)} ${i * 25}`);
	}
	for (let i = 40; i >= 0; i -= 1) {
		points.push(`${i * 25} ${fixed(1000 - random() * 6)}`);
	}
	for (let i = 40; i >= 0; i -= 1) {
		points.push(`${fixed(random() * 6)} ${i * 25}`);
	}
	draw(
		'deckle',
		'0 0 1000 1000',
		`<polygon points="${points.join(' ')}"/>`,
		'preserveAspectRatio="none"'
	);
}
draw(
	'crown',
	'0 0 80 56',
	'<path d="M6 48 L10 16 L26 32 L40 6 L54 32 L70 16 L74 48 Z" fill="#b8892a"/><rect x="6" y="46" width="68" height="8" rx="2" fill="#b8892a"/><circle cx="40" cy="6" r="4" fill="#8a1c3a"/><circle cx="10" cy="16" r="3" fill="#2a5c9a"/><circle cx="70" cy="16" r="3" fill="#2a5c9a"/>'
);

/* ── Every design ──────────────────────────────────────────────────────── */

// A wrapped present, a mask in the design's ink: what marks an item its
// writer has made a surprise.
draw(
	'gift',
	'0 0 24 24',
	// The ribbon is a gap down the middle: a mask goes by what is drawn, not its colour.
	'<path d="M3 9 H11 V13 H3 Z M13 9 H21 V13 H13 Z M4.5 14 H11 V22 H4.5 Z M13 14 H19.5 V22 H13 Z" fill="#000"/><path d="M12 8.5 C9 3 4 4 6 7 C7 8.5 10 8.5 12 8.5 Z M12 8.5 C15 3 20 4 18 7 C17 8.5 14 8.5 12 8.5 Z" fill="none" stroke="#000" stroke-width="1.8"/>'
);

/* ── Prescription pad ──────────────────────────────────────────────────── */

// A clipboard's clip, as they are made: a base plate riveted to the board,
// the hinge barrel the spring sits in, the shallow jaw that grips the paper,
// and a raised lift tab with a hole to hang it by. Brushed
// steel, lit from above.
draw(
	'clip',
	'0 0 140 42',
	'<defs>' +
		'<linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f8fa"/><stop offset=".45" stop-color="#cdd5dc"/><stop offset="1" stop-color="#8e9aa5"/></linearGradient>' +
		'<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b4bec7"/><stop offset="1" stop-color="#6f7b86"/></linearGradient>' +
		'<linearGradient id="barrel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d8994"/><stop offset=".35" stop-color="#eef2f5"/><stop offset=".7" stop-color="#aab4bd"/><stop offset="1" stop-color="#5f6b76"/></linearGradient>' +
		'<linearGradient id="brush" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
		'<radialGradient id="rivet" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#b9c2ca"/><stop offset="1" stop-color="#5d6974"/></radialGradient>' +
		'</defs>' +
		// The base plate, riveted at each end.
		'<rect x="4" y="12" width="132" height="22" rx="7" fill="url(#base)" stroke="#5d6974" stroke-width="1"/>' +
		'<circle cx="17" cy="23" r="5" fill="url(#rivet)" stroke="#4f5a64" stroke-width=".8"/>' +
		'<circle cx="123" cy="23" r="5" fill="url(#rivet)" stroke="#4f5a64" stroke-width=".8"/>' +
		// The lift tab, rising from the barrel, with its hanging hole.
		'<path d="M46 30 C48 6 58 2 70 2 C82 2 92 6 94 30 Z" fill="url(#steel)" stroke="#6f7b86" stroke-width="1"/>' +
		'<ellipse cx="70" cy="14" rx="8" ry="5" fill="#3b4752"/><ellipse cx="70" cy="15" rx="8" ry="4" fill="#26313b"/>' +
		// The jaw, broad and shallow, flaring a little towards its lip.
		'<path d="M20 30 H120 L124 38 Q124 40 121 40 H19 Q16 40 16 38 Z" fill="url(#steel)" stroke="#6f7b86" stroke-width="1.2"/>' +
		'<path d="M25 33 H115 L117 37 H23 Z" fill="url(#brush)"/>' +
		// The barrel, across the hinge.
		'<rect x="18" y="25" width="104" height="11" rx="5.5" fill="url(#barrel)" stroke="#5d6974" stroke-width=".8"/>'
);

/* ── Bedtime story ─────────────────────────────────────────────────────── */

draw(
	'moon',
	'0 0 60 60',
	'<defs><mask id="mn"><rect width="60" height="60" fill="#fff"/><circle cx="40" cy="22" r="22" fill="#000"/></mask></defs><circle cx="30" cy="30" r="26" fill="#fff6c9" mask="url(#mn)"/><circle cx="20" cy="38" r="2.5" fill="#e8dca6" mask="url(#mn)"/>'
);
// A scattered, uneven sky: small dots and four-pointed stars, some of them
// twinkling, kept clear of where the moon and the title sit. It repeats
// across the menu, so a star over the tile's side is drawn on the other side
// as well, or each repeat cut it in half at the seam; and none sits on the
// tile's foot, which is the middle of the sky.
{
	const random = seeded(23);
	let stars = '';
	let placed = 0;
	const reach = 10;
	while (placed < 22) {
		const x = random() * 400;
		const y = reach + random() * (120 - 2 * reach);
		const kind = random();
		if ((x > 300 && y < 60) || (x < 250 && y > 60)) {
			continue;
		}
		const size = pick(kind, [
			[0.55, 3 + random() * 3],
			[0.85, 6 + random() * 3.5],
			[1, 10 + random() * 4]
		]);
		const opacity = (0.4 + random() * 0.6).toFixed(2);
		const twinkle =
			random() < 0.35 ? ` class="tw" style="animation-delay:-${(random() * 3).toFixed(1)}s"` : '';
		const star = (at) =>
			kind < 0.4
				? `<circle cx="${fixed(at)}" cy="${fixed(y)}" r="${fixed(size / 3)}" opacity="${opacity}"${twinkle}/>`
				: `<path d="${sparkle(Number(fixed(at)), Number(fixed(y)), Number(fixed(size / 1.6)))}" opacity="${opacity}"${twinkle}/>`;
		stars += star(x);
		if (x < reach) {
			stars += star(x + 400);
		} else if (x > 400 - reach) {
			stars += star(x - 400);
		}
		placed += 1;
	}
	draw(
		'stars',
		'0 0 400 120',
		`<style>@media (prefers-reduced-motion: no-preference) { .tw { animation: tw 2.6s ease-in-out infinite alternate; } } @keyframes tw { from { opacity: .25; } to { opacity: 1; } }</style><g fill="#fff6c9">${stars}</g>`,
		'preserveAspectRatio="xMidYMid slice"'
	);
}
// A cartoon cloud's top: a few big bumps overlapping into one outline that
// rises to a crest and tapers at both ends. Even rows of equal circles read
// as bubbles. One per course, in a different place along each (the CSS
// places it); drawn in rem, at 16 units each.
for (const [index, seed] of [11, 48, 85, 122].entries()) {
	const random = seeded(seed);
	const span = 20 * (0.2 + random() * 0.075);
	const count = Math.max(4, Math.round(span / 1.7));
	const first = 0.7;
	const step = (span - first * 2) / (count - 1);
	const crest = 0.3 + random() * 0.4;
	const puffs = [];
	for (let i = 0; i < count; i += 1) {
		const along = i / (count - 1);
		const rise = Math.max(0, 1 - Math.abs(along - crest) / 0.65);
		const size =
			step * 1.55 * (i === 0 || i === count - 1 ? 0.75 : 1) +
			rise * rise * 0.55 +
			(random() - 0.5) * 0.15;
		puffs.push([first + i * step + (random() - 0.5) * 0.15, size]);
	}
	const tallest = Math.max(...puffs.map(([, size]) => size));
	// Each bump sits 60% below the cloud's top edge, as if it grew out of it.
	const width = span + tallest;
	const height = tallest;
	const base = tallest * 0.4;
	draw(
		`cloud-${index + 1}`,
		`0 0 ${fixed(width * 16)} ${fixed(height * 16)}`,
		`<g fill="#fff">${puffs.map(([x, size]) => `<circle cx="${fixed((x + tallest / 2) * 16)}" cy="${fixed((base + size * 0.1) * 16)}" r="${fixed((size / 2) * 16)}"/>`).join('')}</g>`,
		`width="${fixed(width * 16)}" height="${fixed(height * 16)}"`
	);
}

/* ── Corkboard ─────────────────────────────────────────────────────────── */

for (const [name, color] of [
	['red', '#d63031'],
	['blue', '#0984e3'],
	['green', '#00b894'],
	['yellow', '#fdcb6e'],
	['purple', '#6c5ce7']
]) {
	draw(
		`pin-${name}`,
		'0 0 30 30',
		`<line x1="15" y1="15" x2="15" y2="29" stroke="#888" stroke-width="2"/><circle cx="15" cy="11" r="9" fill="${color}"/><circle cx="12" cy="8" r="3" fill="rgba(255,255,255,.5)"/>`
	);
}

/* ── Tarot spread, in Build-a-Date's style ─────────────────────────────── */

// Build-a-Date's card frames, drawn 200 units wide: the top and bottom pieces
// keep their shape as the card widens, and the rails between stretch.
const lune = (cx, cy, r, lit, shadow) => {
	const outer = lit === 'right' ? 1 : 0;
	const inner = shadow > 0 === (lit === 'right') ? 0 : 1;
	const rx = Math.abs(shadow) * r;
	return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${outer} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${inner} ${cx} ${cy - r} Z`;
};
const rays = (cx, cy, count, inner, long, short, from = 0, to = 360) => {
	const step = (to - from) / count;
	return Array.from({ length: count + (to - from === 360 ? 0 : 1) }, (_, i) => {
		const angle = ((from + i * step) * Math.PI) / 180;
		const reach = i % 2 === 0 ? long : short;
		return `M ${(cx + Math.cos(angle) * inner).toFixed(2)} ${(cy + Math.sin(angle) * inner).toFixed(2)} L ${(cx + Math.cos(angle) * reach).toFixed(2)} ${(cy + Math.sin(angle) * reach).toFixed(2)}`;
	}).join(' ');
};
const FRAMES = [
	{
		name: 'sun',
		top: [
			70,
			`<path d="M 1 70 V 1 H 199 V 70"/><path d="M 8 70 V 20 A 12 12 0 0 0 20 8 H 180 A 12 12 0 0 0 192 20 V 70"/><circle cx="100" cy="34" r="10"/><path d="${rays(100, 34, 24, 13, 23, 18)}"/><g class="fill"><circle cx="100" cy="34" r="3.5"/><path d="${sparkle(6.5, 6.5, 4)}"/><path d="${sparkle(193.5, 6.5, 4)}"/><path d="${sparkle(52, 26, 4)}"/><path d="${sparkle(148, 26, 4)}"/><circle cx="68" cy="44" r="1.3"/><circle cx="132" cy="44" r="1.3"/></g>`
		],
		bottom: [
			46,
			`<path d="M 1 0 V 45 H 199 V 0"/><path d="M 8 0 V 26 A 12 12 0 0 1 20 38 H 88 M 112 38 H 180 A 12 12 0 0 1 192 26 V 0"/><g class="fill"><path d="${lune(100, 33, 8, 'right', 0.6)}" transform="rotate(90 100 33)"/></g>`
		],
		rails: [1, 8, 192, 199]
	},
	{
		name: 'star',
		top: [
			60,
			`<path d="M 1 60 V 1 H 199 V 60"/><path d="M 7 60 V 7 H 193 V 60"/><path class="faint" d="M 30 36 L 52 24 L 74 32 L 100 20 L 126 32 L 148 24 L 170 36 M 74 32 L 88 44 M 126 32 L 112 44"/><g class="fill"><path d="${sparkle(100, 20, 8)}"/><path d="${sparkle(52, 24, 4.5)}"/><path d="${sparkle(148, 24, 4.5)}"/><circle cx="30" cy="36" r="1.8"/><circle cx="170" cy="36" r="1.8"/><circle cx="74" cy="32" r="1.8"/><circle cx="126" cy="32" r="1.8"/><circle cx="7" cy="7" r="2.5"/><circle cx="193" cy="7" r="2.5"/></g>`
		],
		bottom: [
			36,
			`<path d="M 1 0 V 35 H 199 V 0"/><path d="M 7 0 V 29 H 90 M 110 29 H 193 V 0"/><g class="fill"><path d="${sparkle(100, 29, 5.5)}"/><circle cx="7" cy="29" r="2.5"/><circle cx="193" cy="29" r="2.5"/></g>`
		],
		rails: [1, 7, 193, 199]
	},
	{
		name: 'devil',
		top: [
			64,
			`<path d="M 1 64 V 14 H 7 V 7 H 14 V 1 H 186 V 7 H 193 V 14 H 199 V 64"/><path d="M 10 64 V 22 L 22 10 H 178 L 190 22 V 64"/><path d="M 84 48 A 16 16 0 0 1 116 48"/><path d="M 89 48 A 11 11 0 0 1 111 48"/><path d="${rays(100, 48, 12, 20, 32, 26, 195, 345)}"/><path d="M 26 48 H 72 M 84 48 H 116 M 128 48 H 174"/><g class="fill"><path d="M 95 48 A 5 5 0 0 1 105 48 Z"/><path d="M 22 48 L 26 44 L 30 48 L 26 52 Z"/><path d="M 170 48 L 174 44 L 178 48 L 174 52 Z"/></g>`
		],
		bottom: [
			40,
			'<path d="M 1 0 V 26 H 7 V 33 H 14 V 39 H 186 V 33 H 193 V 26 H 199 V 0"/><path d="M 10 0 V 18 L 22 30 H 178 L 190 18 V 0"/><path d="M 84 24 L 100 16 L 116 24 M 90 24 L 100 19 L 110 24"/><path class="fill" d="M 100 25 L 105 30 L 100 35 L 95 30 Z"/>'
		],
		rails: [1, 10, 190, 199]
	},
	{
		name: 'moon',
		top: [
			90,
			`<path d="M 1 90 V 1 H 199 V 90"/><path d="M 14 90 V 82 A 86 52 0 0 1 186 82 V 90"/><g class="fill"><path d="${lune(62, 16, 4.5, 'left', 0.55)}"/><path d="${lune(81, 16, 4.5, 'left', 0)}"/><circle cx="100" cy="16" r="6"/><path d="${lune(119, 16, 4.5, 'right', 0)}"/><path d="${lune(138, 16, 4.5, 'right', 0.55)}"/><path d="${sparkle(8, 60, 4)}"/><path d="${sparkle(192, 60, 4)}"/></g>`
		],
		bottom: [
			40,
			`<path d="M 1 0 V 39 H 199 V 0"/><path d="M 14 0 V 28 H 90 M 110 28 H 186 V 0"/><path class="fill" d="${lune(96, 28, 6, 'right', 0.6)}" transform="rotate(90 100 28)"/>`
		],
		rails: [1, 14, 186, 199]
	}
];
const frameStyle =
	'<style>* { vector-effect: non-scaling-stroke; } .fill { fill: #a07c4c; stroke: none; } .faint { opacity: .55; }</style>';
for (const frame of FRAMES) {
	for (const end of ['top', 'bottom']) {
		const [height, body] = frame[end];
		draw(
			`frame-${frame.name}-${end}`,
			`0 0 200 ${height}`,
			`${frameStyle}<g fill="none" stroke="#a07c4c" stroke-width="1">${body}</g>`,
			'overflow="visible"'
		);
	}
	draw(
		`frame-${frame.name}-rails`,
		'0 0 200 1',
		`<path d="${frame.rails.map((x) => `M ${x} 0 V 1`).join(' ')}" stroke="#a07c4c" stroke-width="1" vector-effect="non-scaling-stroke"/>`,
		'preserveAspectRatio="none"'
	);
}

// Build-a-Date's galaxy: swirling blue bands at 38°, blue dust, gold veins
// and a few bright stars, as one tile a menu covers itself with.
{
	const random = seeded(7);
	const size = 800;
	const span = Math.hypot(size, size);
	const bands = [];
	let paths = '';
	for (let y = -span; y < span; y += 22 + random() * 18) {
		const phase = random() * 6;
		const amp = 6 + random() * 14;
		const lit = random();
		bands.push({ y, phase, amp });
		let d = '';
		for (let x = -span; x <= span; x += 24) {
			const wave =
				y + Math.sin(x * 0.012 + phase) * amp + Math.sin(x * 0.031 + phase * 2) * amp * 0.3;
			d += `${d ? 'L' : 'M'}${fixed(x)} ${fixed(wave)} `;
		}
		const stroke = pick(lit, [
			[0.25, 'rgba(5,16,58,.6)'],
			[0.6, 'rgba(39,47,136,.5)'],
			[1, 'rgba(56,70,136,.55)']
		]);
		paths += `<path d="${d}" stroke="${stroke}" stroke-width="${fixed(8 + random() * 14)}"/>`;
	}
	let veins = '';
	for (const band of bands.filter((_, i) => i % 4 === 1)) {
		for (let i = 0; i < 70; i += 1) {
			const x = -span + random() * span * 2;
			const off = (random() + random() + random() - 1.5) * 10;
			const y = band.y + Math.sin(x * 0.012 + band.phase) * band.amp + off;
			const opacity = Math.max(0.15, 1 - Math.abs(off) / 12).toFixed(2);
			const color = random() > 0.5 ? '#debd63' : '#e0c492';
			veins += `<circle cx="${fixed(x)}" cy="${fixed(y)}" r="${(0.4 + random() * Math.max(0.2, 1.4 - Math.abs(off) / 12)).toFixed(2)}" fill="${color}" opacity="${opacity}"/>`;
		}
	}
	let stars = '';
	for (let i = 0; i < 12; i += 1) {
		stars += `<circle cx="${fixed(random() * size)}" cy="${fixed(random() * size)}" r="6" fill="url(#glint)"/>`;
	}
	draw(
		'galaxy',
		`0 0 ${size} ${size}`,
		`<defs><filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6"/></filter><filter id="dust" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="4" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 .35  0 0 0 0 .38  0 0 0 0 .62  1.6 0 0 0 -1.05"/></filter><radialGradient id="glint"><stop offset="0" stop-color="#fffaec"/><stop offset=".3" stop-color="#f0d496" stop-opacity=".5"/><stop offset="1" stop-color="#f0d496" stop-opacity="0"/></radialGradient></defs><rect width="${size}" height="${size}" fill="#0e1a57"/><g transform="translate(${size / 2} ${size / 2}) rotate(-38)"><g fill="none" filter="url(#soft)">${paths}</g>${veins}</g><rect width="${size}" height="${size}" filter="url(#dust)"/>${stars}`,
		`width="${size}" height="${size}"`
	);
}

/* ── Seed packets ──────────────────────────────────────────────────────── */

draw(
	'flower-daisy',
	'0 0 80 80',
	`<path d="M40 44 V78" stroke="#5f8a42" stroke-width="3"/><path d="M40 64 Q28 56 22 62 Q30 66 40 64" fill="#6f9a52"/>${repeat(12, (i) => `<ellipse cx="40" cy="22" rx="4.5" ry="13" fill="#fff" stroke="#e6dccb" transform="rotate(${i * 30} 40 34)"/>`)}<circle cx="40" cy="34" r="7" fill="#f2c14e"/>`
);
draw(
	'flower-tulip',
	'0 0 80 80',
	'<path d="M40 44 V78" stroke="#5f8a42" stroke-width="3"/><path d="M40 70 Q22 60 20 40 Q34 52 40 70" fill="#6f9a52"/><path d="M26 18 Q30 46 40 46 Q50 46 54 18 Q47 28 40 16 Q33 28 26 18 Z" fill="#d6455e"/><path d="M40 16 Q36 30 40 46" stroke="#a82a42" stroke-width="1.5" fill="none"/>'
);
draw(
	'flower-poppy',
	'0 0 80 80',
	'<path d="M42 46 Q40 62 44 78" stroke="#5f8a42" stroke-width="3" fill="none"/><path d="M20 30 Q24 10 42 14 Q60 10 62 30 Q64 48 42 46 Q20 50 20 30 Z" fill="#e8613c"/><path d="M42 14 Q36 30 42 46 M24 24 Q36 30 42 30 M60 24 Q48 30 42 30" stroke="#b8401f" stroke-width="1.2" fill="none"/><circle cx="42" cy="31" r="5" fill="#2a1d33"/>'
);
draw(
	'flower-lavender',
	'0 0 80 80',
	`<path d="M30 78 Q34 50 30 20 M40 78 V14 M50 78 Q46 50 50 22" stroke="#6f9a52" stroke-width="2.2" fill="none"/>${[
		[30, 22],
		[40, 16],
		[50, 24]
	]
		.map(([x, y]) =>
			repeat(
				6,
				(i) =>
					`<ellipse cx="${x + (i % 2 ? 2.5 : -2.5)}" cy="${y + i * 5}" rx="3" ry="4" fill="#9a82c6"/>`
			)
		)
		.join('')}`
);

// More for a packet, to pick from, in the same flat watercolour: a rose, a
// sunflower, an iris, bluebells, forget-me-nots, cherry blossom, a peony and
// a lily.
const flowerStem = (d) => `<path d="${d}" stroke="#5f8a42" stroke-width="3" fill="none"/>`;
const flowerLeaf = (d) => `<path d="${d}" fill="#6f9a52"/>`;
draw(
	'flower-rose',
	'0 0 80 80',
	`${flowerStem('M40 44 Q38 62 40 78')}${flowerLeaf('M39 62 Q24 54 20 60 Q28 66 39 64')}<circle cx="40" cy="30" r="16" fill="#c9304e"/><path d="M40 16 Q52 18 54 30 Q50 22 40 22 Q30 22 27 32 Q26 20 40 16 Z" fill="#e2506a"/><path d="M33 30 Q36 22 44 24 Q50 28 46 34 Q42 38 37 35 Q34 32 38 30 Q41 29 42 32" fill="none" stroke="#8f1d33" stroke-width="1.6" stroke-linecap="round"/><path d="M26 34 Q30 46 40 46 Q50 46 54 34" fill="none" stroke="#a82a42" stroke-width="1.4"/>`
);
draw(
	'flower-sunflower',
	'0 0 80 80',
	`${flowerStem('M40 50 V78')}${flowerLeaf('M40 66 Q54 56 60 62 Q52 68 40 68')}${repeat(16, (i) => `<ellipse cx="40" cy="12" rx="4" ry="11" fill="#f2b41e" stroke="#d9951a" stroke-width=".8" transform="rotate(${i * 22.5} 40 30)"/>`)}<circle cx="40" cy="30" r="10" fill="#6b3f1d"/><circle cx="40" cy="30" r="6" fill="#4a2a12"/>`
);
draw(
	'flower-iris',
	'0 0 80 80',
	`${flowerStem('M40 46 V78')}${flowerLeaf('M40 76 Q30 54 34 40 Q38 58 40 76')}<path d="M40 10 Q48 20 44 34 Q40 40 36 34 Q32 20 40 10 Z" fill="#7a63c9"/><path d="M38 34 Q22 30 16 42 Q28 46 38 38 Z" fill="#6a52b8"/><path d="M42 34 Q58 30 64 42 Q52 46 42 38 Z" fill="#6a52b8"/><path d="M22 40 Q28 38 34 38 M58 40 Q52 38 46 38" stroke="#f2c14e" stroke-width="2" stroke-linecap="round"/><path d="M40 14 V32" stroke="#4e3a96" stroke-width="1.2"/>`
);
draw(
	'flower-bluebell',
	'0 0 80 80',
	`<path d="M30 78 Q28 40 46 16" stroke="#5f8a42" stroke-width="2.5" fill="none"/>${flowerLeaf('M30 76 Q18 56 22 40 Q28 58 30 76')}${[
		[34, 34],
		[40, 24],
		[46, 16],
		[31, 46]
	]
		.map(
			([x, y]) =>
				`<path d="M${x} ${y} Q${x + 4} ${y + 2} ${x + 8} ${y + 2}" stroke="#5f8a42" stroke-width="1.6" fill="none"/><path d="M${x + 4} ${y + 2} Q${x + 2} ${y + 10} ${x + 3} ${y + 14} L${x + 6} ${y + 12} L${x + 8} ${y + 15} L${x + 10} ${y + 12} L${x + 13} ${y + 14} Q${x + 14} ${y + 8} ${x + 10} ${y + 2} Z" fill="#5b7bd6"/>`
		)
		.join('')}`
);
draw(
	'flower-forget-me-not',
	'0 0 80 80',
	`${flowerStem('M40 50 Q38 64 40 78')}${flowerLeaf('M39 64 Q26 58 22 64 Q30 70 39 66')}${[
		[30, 26, 9],
		[50, 24, 9],
		[40, 40, 10],
		[24, 44, 7],
		[56, 44, 7]
	]
		.map(
			([x, y, r]) =>
				`${repeat(5, (i) => `<circle cx="${x}" cy="${y - r * 0.55}" r="${r * 0.45}" fill="#7fb2ea" transform="rotate(${i * 72} ${x} ${y})"/>`)}<circle cx="${x}" cy="${y}" r="${r * 0.22}" fill="#f2d14e"/>`
		)
		.join('')}`
);
draw(
	'flower-blossom',
	'0 0 80 80',
	`<path d="M8 70 Q30 56 44 58 Q60 60 74 46" stroke="#6b4a32" stroke-width="3.5" fill="none" stroke-linecap="round"/>${[
		[30, 38, 11],
		[56, 34, 10],
		[44, 18, 8]
	]
		.map(
			([x, y, r]) =>
				`${repeat(5, (i) => `<path d="M${x} ${y} Q${x - r * 0.7} ${y - r * 0.8} ${x} ${y - r * 1.15} Q${x + r * 0.7} ${y - r * 0.8} ${x} ${y} Z" fill="#f7b6c8" stroke="#e88aa6" stroke-width=".8" transform="rotate(${i * 72} ${x} ${y})"/>`)}<circle cx="${x}" cy="${y}" r="${r * 0.2}" fill="#d65f86"/>`
		)
		.join('')}`
);
draw(
	'flower-peony',
	'0 0 80 80',
	`${flowerStem('M40 50 V78')}${flowerLeaf('M40 64 Q24 58 20 66 Q30 70 40 66')}${flowerLeaf('M40 68 Q56 62 60 70 Q50 72 40 70')}<circle cx="40" cy="32" r="20" fill="#f29bb2"/>${repeat(8, (i) => `<ellipse cx="40" cy="18" rx="8" ry="10" fill="#f6b3c5" transform="rotate(${i * 45} 40 32)"/>`)}<circle cx="40" cy="32" r="11" fill="#ee8aa5"/><path d="M34 32 Q40 24 46 32 Q40 38 34 32" fill="#f6b3c5"/>`
);
draw(
	'flower-lily',
	'0 0 80 80',
	`${flowerStem('M40 46 Q42 62 40 78')}${flowerLeaf('M41 66 Q56 58 60 64 Q52 70 41 68')}${repeat(6, (i) => `<path d="M40 34 Q34 20 40 6 Q46 20 40 34 Z" fill="#fbf3ea" stroke="#e6c9b8" stroke-width="1" transform="rotate(${i * 60} 40 34)"/>`)}${repeat(6, (i) => `<path d="M40 34 L40 18" stroke="#f0a35e" stroke-width="1.2" transform="rotate(${i * 60 + 30} 40 34)"/><circle cx="40" cy="18" r="1.6" fill="#b5532b" transform="rotate(${i * 60 + 30} 40 34)"/>`)}`
);

/* ── Cross-stitch sampler ──────────────────────────────────────────────── */

// Each pixel of a little picture is a cross, as stitched on aida cloth.
const STITCH = {
	p: '#e87aa0',
	P: '#b04a6a',
	y: '#f2c14e',
	g: '#5f9a6a',
	G: '#3f6f4c',
	w: '#d8cfc2',
	b: '#9a8070',
	o: '#e07a3a',
	k: '#3a3550',
	l: '#9a8ad6'
};
function stitched(name, rows, cell = 6, attrs = '') {
	let body = '';
	for (const [y, row] of rows.entries()) {
		for (const [x, ch] of [...row].entries()) {
			const color = STITCH[ch];
			if (color) {
				const x0 = x * cell + 1;
				const y0 = y * cell + 1;
				const x1 = x0 + cell - 2;
				const y1 = y0 + cell - 2;
				body += `<path d="M${x0} ${y0} L${x1} ${y1} M${x1} ${y0} L${x0} ${y1}" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>`;
			}
		}
	}
	draw(name, `0 0 ${rows[0].length * cell} ${rows.length * cell}`, body, attrs);
}
stitched('bunny', [
	'..b...b..',
	'..bb..bb.',
	'..pb..pb.',
	'..bb..bb.',
	'.bbbbbbb.',
	'bbkbbbkbb',
	'bbbbpbbbb',
	'.bbbbbbb.',
	'.bbwwwbb.',
	'bbbwwwbbb',
	'bbbbbbbbb',
	'.bb...bb.'
]);
stitched('fox', [
	'o.......o',
	'oo.....oo',
	'ooo...ooo',
	'ooooooooo',
	'okoooooko',
	'ooowwwooo',
	'.owwkwwo.',
	'..wwwww..',
	'...www...'
]);
stitched('stitched-flower', [
	'.p.p.',
	'ppPpp',
	'.pyp.',
	'ppPpp',
	'.pgp.',
	'..g..',
	'g.g.g',
	'.ggg.'
]);
// More for the sampler, to pick from: a heart, a house, a cat, a bird, a
// mushroom and a strawberry.
Object.assign(STITCH, { r: '#d64545', c: '#8a8aa0', B: '#6b4a32' });
stitched('stitched-heart', [
	'.pp.pp.',
	'pPpppPp',
	'ppppppp',
	'ppppppp',
	'.ppppp.',
	'..ppp..',
	'...p...'
]);
stitched('stitched-house', [
	'....P....',
	'...PPP...',
	'..PPPPP..',
	'.PPPPPPP.',
	'PPPPPPPPP',
	'.bbbbbbb.',
	'.byybbbb.',
	'.byybkkb.',
	'.bbbbkkb.',
	'.bbbbkkb.'
]);
stitched('stitched-cat', [
	'c.......c',
	'cc.....cc',
	'ccccccccc',
	'cgcccccgc',
	'ccccpcccc',
	'.cwwwwwc.',
	'.ccccccc.',
	'.ccccccc.',
	'cc.....cc'
]);
stitched('stitched-bird', [
	'...ll....',
	'..llll...',
	'.lklll..l',
	'yllllllll',
	'.llwwwll.',
	'..lwwwl..',
	'...l..l..'
]);
stitched('stitched-mushroom', [
	'..rrrrr..',
	'.rrwrrrr.',
	'rrrrrrwrr',
	'rwrrrrrrr',
	'rrrrrrrrr',
	'...www...',
	'...www...',
	'..wwwww..'
]);
stitched('stitched-strawberry', [
	'...gGg...',
	'..gGgGg..',
	'.rrrrrrr.',
	'rryrrryrr',
	'rrrrrrrrr',
	'.rryrrrr.',
	'..rrrry..',
	'...rrr...',
	'....r....'
]);
stitched(
	'vine',
	['..........l....', '.g.......lyl...', 'gGg.......l....', '.g.g....g.g.g..', '...GGGGGGGGGGGG'],
	5,
	'width="42" height="26" preserveAspectRatio="none"'
);

/* ── Toy chest ─────────────────────────────────────────────────────────── */

const brassDefs =
	'<linearGradient id="brassT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a5418"/><stop offset=".4" stop-color="#f6dc95"/><stop offset=".6" stop-color="#c99a3c"/><stop offset="1" stop-color="#6a4a14"/></linearGradient>';
// A satin sleep mask: two lobes with a dip for the nose, piped edges, a sheen.
draw(
	'toy-mask',
	'0 0 100 70',
	'<defs><linearGradient id="satin" x1="0" y1="0" x2="1" y2=".6"><stop offset="0" stop-color="#121016"/><stop offset=".38" stop-color="#3a323e"/><stop offset=".5" stop-color="#8a7c8c"/><stop offset=".62" stop-color="#2e2732"/><stop offset="1" stop-color="#0c0a0f"/></linearGradient><radialGradient id="lobe" cx=".5" cy=".35" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><path d="M10 38 C10 23 28 17 50 21 C72 17 90 23 90 38 C90 53 76 60 63 56 C56 54 55 47 50 47 C45 47 44 54 37 56 C24 60 10 53 10 38 Z" fill="url(#satin)" stroke="#5a4c5e" stroke-width="1.8"/><path d="M15 38 C15 27 29 22 50 25.5 C71 22 85 27 85 38 C85 49 75 54 64 51.5 C57 50 56 43.5 50 43.5 C44 43.5 43 50 36 51.5 C25 54 15 49 15 38 Z" fill="none" stroke="#b89a6a" stroke-width=".9" stroke-dasharray="2 1.6" opacity=".7"/><ellipse cx="31" cy="34" rx="15" ry="9" fill="url(#lobe)"/><ellipse cx="69" cy="34" rx="15" ry="9" fill="url(#lobe)"/>'
);
// A leather cuff in three-quarter view: suede lining inside the far rim, the
// band's face stitched along both edges, a buckle and a D-ring.
const cuff = (x, y, scale, turn) =>
	`<g transform="translate(${x} ${y}) rotate(${turn}) scale(${scale})"><ellipse cx="0" cy="0" rx="30" ry="11" fill="#5a2846"/><ellipse cx="0" cy="1.5" rx="25.5" ry="8" fill="#2a0f20"/><path d="M-30 0 A30 11 0 0 0 30 0 V15 A30 11 0 0 1 -30 15 Z" fill="url(#hide)"/><path d="M-27.5 4 A27.5 9.5 0 0 0 27.5 4 M-27.5 12 A27.5 9.5 0 0 0 27.5 12" fill="none" stroke="#d9b48a" stroke-width="1" stroke-dasharray="2.2 1.8" opacity=".8"/><path d="M-24 6 A26 9 0 0 0 -6 10.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".18"/><rect x="-6" y="11" width="12" height="12.5" rx="1.5" fill="none" stroke="url(#brassT)" stroke-width="2.4"/><path d="M0 12 V22.5" stroke="url(#brassT)" stroke-width="1.6"/><path d="M6 13 H14 V21.5 H6" fill="#1a0f0d"/><path d="M30.6 2 H33.4 A5.5 5.5 0 0 1 33.4 13 H30.6 Z" fill="none" stroke="url(#brassT)" stroke-width="2.6" stroke-linejoin="round"/></g>`;
draw(
	'toy-cuffs',
	'0 0 100 90',
	`<defs>${brassDefs}<linearGradient id="hide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#140c0b"/><stop offset=".45" stop-color="#4a3430"/><stop offset=".6" stop-color="#2e1f1c"/><stop offset="1" stop-color="#0e0807"/></linearGradient></defs>${cuff(38, 22, 0.95, -8)}${cuff(58, 58, 1, 6)}`
);
// After the Hitachi Magic Wand: an off-white body in one piece, a
// marshmallow-shaped head wider than the body on a short ribbed neck, a slide
// switch, and the mains cord snaking off to the left, out of the slot.
draw(
	'toy-wand',
	'-10 -8 100 192',
	'<defs><linearGradient id="wandBody" x1="0" x2="1"><stop offset="0" stop-color="#a9a49c"/><stop offset=".35" stop-color="#fbf9f4"/><stop offset=".65" stop-color="#e8e4dc"/><stop offset="1" stop-color="#8f8a82"/></linearGradient><radialGradient id="wandHead" cx=".38" cy=".28" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e6e2da"/><stop offset="1" stop-color="#a39d94"/></radialGradient><linearGradient id="wandNeck" x1="0" x2="1"><stop offset="0" stop-color="#8f8a82"/><stop offset=".4" stop-color="#e2ded6"/><stop offset="1" stop-color="#7f7a72"/></linearGradient></defs><g transform="rotate(-14 40 80)"><path d="M40 152 C40 164 30 166 20 162 C8 157 2 170 -14 172 C-40 175 -60 160 -140 168" fill="none" stroke="#9a958d" stroke-width="3" stroke-linecap="round"/><path d="M36.5 146 H43.5 L42.5 154 H37.5 Z" fill="#8f8a82"/><path d="M29 52 C27 62 28 74 30 84 C31 104 32 126 33 146 Q40 150 47 146 C48 126 49 104 50 84 C52 74 53 62 51 52 Z" fill="url(#wandBody)"/><path d="M31 40 C32 44 32 48 30 53 H50 C48 48 48 44 49 40 Z" fill="url(#wandNeck)"/><path d="M31.5 44 H48.5 M31.3 48 H48.7" stroke="#7a756d" stroke-width="1" opacity=".6"/><path d="M22.5 14 C22.5 6.5 30 3 40 3 C50 3 57.5 6.5 57.5 14 V31 C57.5 38.5 50 41.5 40 41.5 C30 41.5 22.5 38.5 22.5 31 Z" fill="url(#wandHead)"/><path d="M23 31 C24.5 37.5 31 40 40 40 C49 40 55.5 37.5 57 31" fill="none" stroke="#9a948b" stroke-width="1.2" opacity=".6"/><path d="M26.5 25 V14 Q27.5 7.5 35 6.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"/><rect x="36" y="66" width="8" height="22" rx="4" fill="#1f4f9a"/><rect x="37.4" y="69" width="5.2" height="7" rx="2" fill="#f4f2ec"/><path d="M38 80 H42 M38 84 H42" stroke="#9ab8e6" stroke-width=".8"/><rect x="31.5" y="96" width="17" height="3" rx="1" fill="#1f4f9a" opacity=".85"/><path d="M31 60 C31 80 33 110 34 140" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".7"/></g>',
	'overflow="visible"'
);
draw(
	'toy-candle',
	'0 0 90 80',
	'<defs><linearGradient id="tin" x1="0" x2="1"><stop offset="0" stop-color="#9c6e5e"/><stop offset=".35" stop-color="#f2c9b6"/><stop offset=".6" stop-color="#c9917c"/><stop offset="1" stop-color="#7a5040"/></linearGradient></defs><path d="M12 40 V66 A33 9 0 0 0 78 66 V40" fill="url(#tin)"/><ellipse cx="45" cy="40" rx="33" ry="9" fill="#d9a690"/><ellipse cx="45" cy="41" rx="28" ry="7" fill="#f6ead8"/><ellipse cx="45" cy="42" rx="12" ry="3" fill="#efd9b8"/><path d="M45 40 V34" stroke="#2a1a1a" stroke-width="1.4"/><path d="M45 16 Q53 27 45 35 Q37 27 45 16 Z" fill="#ffcf5c"/><path d="M45 23 Q48 28 45 33 Q42 28 45 23 Z" fill="#fff6d0"/><circle cx="45" cy="28" r="12" fill="#ffb347" opacity=".2"/>'
);

// A hank of red rope, coiled: loops stacked a little askew, each with the lay
// of its strands drawn across it, and a whipped tail trailing off.
const loop = (y, rx, turn) =>
	`<g transform="rotate(${turn} 50 ${y})"><ellipse cx="50" cy="${y}" rx="${rx}" ry="11" fill="none" stroke="url(#ropeBody)" stroke-width="7"/><ellipse cx="50" cy="${y}" rx="${rx}" ry="11" fill="none" stroke="#4a0d14" stroke-width="7" stroke-dasharray="1.4 3.2" opacity=".55"/></g>`;
draw(
	'toy-rope',
	'0 0 100 90',
	`<defs><linearGradient id="ropeBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2565e"/><stop offset=".5" stop-color="#b3202c"/><stop offset="1" stop-color="#6e0c16"/></linearGradient></defs>${loop(58, 36, -4)}${loop(50, 34, 3)}${loop(42, 35, -2)}${loop(34, 33, 4)}<path d="M80 40 C92 52 90 70 78 80" fill="none" stroke="url(#ropeBody)" stroke-width="6.5" stroke-linecap="round"/><path d="M80 40 C92 52 90 70 78 80" fill="none" stroke="#4a0d14" stroke-width="6.5" stroke-dasharray="1.4 3.2" opacity=".55"/><rect x="73" y="76" width="9" height="6" rx="1.5" transform="rotate(30 77 79)" fill="#f2e2c0"/>`
);
// Anal beads in glossy silicone: a string of spheres growing smaller toward
// the tip, joined by a flexible stem, with a ring at the end to pull.
const bead = (x, y, r) =>
	`<circle cx="${x}" cy="${y}" r="${r}" fill="url(#beadBody)"/><ellipse cx="${x - r * 0.35}" cy="${y - r * 0.4}" rx="${r * 0.32}" ry="${r * 0.2}" fill="#fff" opacity=".55" transform="rotate(-30 ${x - r * 0.35} ${y - r * 0.4})"/>`;
draw(
	'toy-beads',
	'0 0 120 100',
	`<defs><radialGradient id="beadBody" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e6a2f0"/><stop offset=".55" stop-color="#9b3fb3"/><stop offset="1" stop-color="#4c1460"/></radialGradient></defs><path d="M16 80 Q32 70 44 62 Q60 50 74 40 Q88 30 104 18" fill="none" stroke="#7a2a92" stroke-width="3"/><circle cx="12" cy="84" r="8" fill="none" stroke="#7a2a92" stroke-width="3.5"/>${bead(30, 72, 9)}${bead(50, 58, 8)}${bead(68, 45, 7)}${bead(84, 33, 6)}${bead(98, 23, 5)}`
);
// A silicone dildo, standing on its suction-cup base at a slight lean: a
// rounded head with a ridge, a gently curved shaft, a sheen down one side.
draw(
	'toy-dildo',
	'0 0 80 150',
	'<defs><linearGradient id="dildoBody" x1="0" x2="1"><stop offset="0" stop-color="#9c2f5e"/><stop offset=".35" stop-color="#f27aa8"/><stop offset=".6" stop-color="#d84d85"/><stop offset="1" stop-color="#7a1f48"/></linearGradient><radialGradient id="dildoCup" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#f27aa8"/><stop offset="1" stop-color="#7a1f48"/></radialGradient></defs><g transform="rotate(10 40 130)"><ellipse cx="40" cy="134" rx="24" ry="7" fill="url(#dildoCup)"/><path d="M28 132 C28 110 26 80 27 52 C27 40 28 34 30 30 L50 30 C52 34 53 40 53 52 C54 80 52 110 52 132 Z" fill="url(#dildoBody)"/><path d="M27 34 C24 16 32 6 40 6 C48 6 56 16 53 34 C49 38 31 38 27 34 Z" fill="url(#dildoBody)"/><path d="M27.5 33 C31 37.5 49 37.5 52.5 33" fill="none" stroke="#7a1f48" stroke-width="1.6" opacity=".7"/><path d="M33 14 C34 10 37 9 39 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/><path d="M33 44 C32 70 32 100 33 126" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".45"/></g>'
);
// A jewelled plug in polished steel, lying at an angle: a teardrop bulb, a
// narrow neck and a round flat base set with a cut pink gem.
draw(
	'toy-plug',
	'0 0 110 90',
	'<defs><linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5e646c"/><stop offset=".3" stop-color="#f4f6f8"/><stop offset=".55" stop-color="#a7adb5"/><stop offset=".8" stop-color="#e2e6ea"/><stop offset="1" stop-color="#4c5158"/></linearGradient><radialGradient id="gem" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffd6ea"/><stop offset=".5" stop-color="#ff4fa0"/><stop offset="1" stop-color="#9a0f52"/></radialGradient></defs><g transform="rotate(-28 55 45)"><path d="M18 45 C18 30 32 24 46 30 C52 33 56 40 60 43 L70 43 L70 47 L60 47 C56 50 52 57 46 60 C32 66 18 60 18 45 Z" fill="url(#steel)"/><path d="M26 38 C30 33 37 32 42 34" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/><ellipse cx="76" cy="45" rx="7" ry="17" fill="url(#steel)"/><ellipse cx="78" cy="45" rx="5.5" ry="13" fill="#c9ced4"/><polygon points="78,35 84,40 84,50 78,55 72,50 72,40" fill="url(#gem)" stroke="#ffd6ea" stroke-width=".6"/><polygon points="78,39 81,42 81,48 78,51 75,48 75,42" fill="#ff8ac0" opacity=".6"/></g>'
);

/* ── write ─────────────────────────────────────────────────────────────── */

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const [name, content] of files) {
	await writeFile(join(outDir, `${name}.svg`), `${content}\n`);
}
process.stdout.write(`${files.size} drawings in static/menu-art/\n`);
