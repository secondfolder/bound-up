#!/usr/bin/env node
/**
 * Fetches the faces the scene menu designs use (src/lib/scenes/menu-designs.ts)
 * from Google Fonts, Latin subset only, into static/fonts/menu/, and writes
 * the @font-face rules for them to src/lib/scenes/menu-fonts.css.
 *
 * Self-hosted, as the app's own faces are (src/lib/theme.css): no request to
 * a third party when someone opens a scene. A browser only downloads a face a
 * page actually uses, so the twenty-odd files cost nothing until a menu picks
 * the design that wants them.
 *
 * Run by hand when the list changes: `node scripts/menu-fonts/fetch.mjs`.
 * Every Google face is under the SIL Open Font Licence except Special Elite
 * (Apache 2.0); static/fonts/menu/SOURCES.txt records each. One face is not
 * Google's: Tan Pearl, the tarot spread's, which Build-a-Date uses and which
 * is kept beside this script (`tan-pearl.otf`) and copied across. Its
 * licence for this app has not been checked: see SOURCES.txt.
 */

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FAMILIES = [
	['Alfa Slab One', 'wght@400', 'OFL'],
	['Amatic SC', 'wght@700', 'OFL'],
	['Baloo 2', 'wght@500;700;800', 'OFL'],
	['Bebas Neue', 'wght@400', 'OFL'],
	['Caveat', 'wght@500;700', 'OFL'],
	['Cinzel', 'wght@400;600', 'OFL'],
	['Cinzel Decorative', 'wght@700', 'OFL'],
	['Cormorant Garamond', 'ital,wght@0,400;0,600;1,400', 'OFL'],
	['Fredericka the Great', 'wght@400', 'OFL'],
	['Fredoka', 'wght@400;600', 'OFL'],
	['IBM Plex Mono', 'wght@400;600', 'OFL'],
	['IBM Plex Sans', 'wght@400;600', 'OFL'],
	['IM Fell English', 'ital@0;1', 'OFL'],
	['IM Fell English SC', 'wght@400', 'OFL'],
	['Italiana', 'wght@400', 'OFL'],
	['Josefin Sans', 'wght@400;600', 'OFL'],
	['Jost', 'wght@400;500', 'OFL'],
	['Kalam', 'wght@400;700', 'OFL'],
	['La Belle Aurore', 'wght@400', 'OFL'],
	['Monoton', 'wght@400', 'OFL'],
	['Oswald', 'wght@400;600', 'OFL'],
	['Pinyon Script', 'wght@400', 'OFL'],
	['Playfair Display', 'ital,wght@0,600;1,400;1,900', 'OFL'],
	['Poiret One', 'wght@400', 'OFL'],
	['Quicksand', 'wght@400;600', 'OFL'],
	['Shrikhand', 'wght@400', 'OFL'],
	['Silkscreen', 'wght@400', 'OFL'],
	['Special Elite', 'wght@400', 'Apache-2.0'],
	['UnifrakturMaguntia', 'wght@400', 'OFL'],
	['Yuji Syuku', 'wght@400', 'OFL'],
	['Zen Old Mincho', 'wght@400;700', 'OFL']
];

// A browser that takes woff2 is what Google answers with woff2 for.
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const root = new URL('../..', import.meta.url).pathname;
const fontDir = join(root, 'static/fonts/menu');
await mkdir(fontDir, { recursive: true });

/**
 * One named group's value from a match, or undefined.
 * @param {RegExp} pattern
 * @param {string} text
 */
function capture(pattern, text) {
	// Annotated, as AGENTS.md says: Biome believes `exec` never returns null.
	/** @type {RegExpExecArray | null} */
	const match = pattern.exec(text);
	return match?.groups?.value;
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const rules = [];
const sources = [];
// A variable face is one file for every weight; it is saved once.
const saved = new Map();

for (const [family, axes, licence] of FAMILIES) {
	const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replaceAll('%20', '+')}:${axes}&display=swap`;
	const css = await (await fetch(url, { headers: { 'user-agent': USER_AGENT } })).text();
	const blocks = css.split('/* ').filter((block) => block.startsWith('latin */'));
	if (blocks.length === 0) {
		throw new Error(`No Latin subset for ${family}`);
	}
	for (const block of blocks) {
		const style = capture(/font-style: (?<value>\w+)/, block) ?? 'normal';
		const weight = capture(/font-weight: (?<value>[\d ]+)/, block) ?? '400';
		const src = capture(/url\((?<value>https:[^)]+\.woff2)\)/, block);
		const range = capture(/unicode-range: (?<value>[^;]+);/, block);
		if (!src) {
			throw new Error(`No woff2 for ${family} ${style} ${weight}`);
		}
		let file = saved.get(src);
		if (!file) {
			file = `${slug(family)}-${style}-${weight.replace(' ', '-')}.woff2`;
			await writeFile(join(fontDir, file), Buffer.from(await (await fetch(src)).arrayBuffer()));
			saved.set(src, file);
		}
		rules.push(
			`@font-face {\n\tfont-family: '${family}';\n\tfont-style: ${style};\n\tfont-weight: ${weight};\n\tfont-display: swap;\n\tsrc: url('/fonts/menu/${file}') format('woff2');\n\tunicode-range: ${range};\n}`
		);
	}
	sources.push(
		`${family}: Google Fonts (https://fonts.google.com/specimen/${family.replaceAll(' ', '+')}), ${licence}`
	);
}

await copyFile(new URL('tan-pearl.otf', import.meta.url), join(fontDir, 'tan-pearl.otf'));
rules.push(
	"@font-face {\n\tfont-family: 'Tan Pearl';\n\tfont-style: normal;\n\tfont-weight: 400;\n\tfont-display: swap;\n\tsrc: url('/fonts/menu/tan-pearl.otf') format('opentype');\n}"
);
sources.push(
	'Tan Pearl: Tan Type, as Build-a-Date uses it. NOT CHECKED: its licence for this app has not been confirmed.'
);

await writeFile(
	join(root, 'src/lib/scenes/menu-fonts.css'),
	`/*\n * The faces the scene menu designs use, self-hosted, Latin only. Generated by\n * scripts/menu-fonts/fetch.mjs: edit that, not this. A browser downloads a\n * face only when a menu on the page uses it. See docs/scenes.md, "Menu designs".\n */\n\n${rules.join('\n\n')}\n`
);
await writeFile(
	join(fontDir, 'SOURCES.txt'),
	`Fonts for the scene menu designs, Latin subsets, fetched by scripts/menu-fonts/fetch.mjs.\nSIL Open Font Licence 1.1: https://openfontlicense.org. Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0.\n\n${sources.join('\n')}\n`
);
process.stdout.write(`${rules.length} faces from ${FAMILIES.length} families\n`);
