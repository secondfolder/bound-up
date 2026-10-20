/**
 * Which parts of one text were not in another, word by word: `to` cut into
 * runs, each marked `added` when it is not part of the longest run of words
 * the two share in order. For showing what was put round a text on its way
 * somewhere, such as the server's words round a picture's description.
 *
 * Words and punctuation are compared separately, so "desk." matches "desk"
 * with only the stop added. Spacing is never compared: it goes with whatever
 * it sits between, added only when both sides of it are.
 */

export type DiffRun = { text: string; added: boolean };

const TOKEN = /[\p{L}\p{N}'’]+|[^\p{L}\p{N}'’\s]+|\s+/gu;
const SPACE = /^\s+$/u;

/**
 * The words of `to` kept by a longest common subsequence with `from`'s,
 * choosing, among the equally long ones, the one in fewest runs. Without the
 * second rule the first "A" of "A candid photograph. A woman…" was matched
 * to the description's "A", splitting the description across the wrapper.
 */
function kept(from: string[], to: string[]): boolean[] {
	// A match is worth far more than a run costs, so length always wins and
	// runs only break ties.
	const Match = to.length + from.length + 1;
	const width = to.length + 1;
	// best[c][i * width + j]: the best score for from[i..] and to[j..], where
	// c is 1 when the pair before (i - 1, j - 1) was matched, so matching
	// (i, j) continues its run rather than starting one.
	const best = [
		new Float64Array((from.length + 1) * width),
		new Float64Array((from.length + 1) * width)
	];
	const at = (run: number, a: number, b: number) =>
		(best[run] as Float64Array)[a * width + b] as number;
	for (let i = from.length - 1; i >= 0; i -= 1) {
		for (let j = to.length - 1; j >= 0; j -= 1) {
			const skip = Math.max(at(0, i + 1, j), at(0, i, j + 1));
			for (const c of [0, 1]) {
				const match = from[i] === to[j] ? Match - (c === 1 ? 0 : 1) + at(1, i + 1, j + 1) : -1;
				(best[c] as Float64Array)[i * width + j] = Math.max(match, skip);
			}
		}
	}
	const keeps = new Array<boolean>(to.length).fill(false);
	let i = 0;
	let j = 0;
	let c = 0;
	while (i < from.length && j < to.length) {
		const here = at(c, i, j);
		if (from[i] === to[j] && here === Match - (c === 1 ? 0 : 1) + at(1, i + 1, j + 1)) {
			keeps[j] = true;
			i += 1;
			j += 1;
			c = 1;
		} else if (here === at(0, i + 1, j)) {
			i += 1;
			c = 0;
		} else {
			j += 1;
			c = 0;
		}
	}
	return keeps;
}

export function addedRuns(from: string, to: string): DiffRun[] {
	const fromWords = (from.match(TOKEN) ?? []).filter((token) => !SPACE.test(token));
	const tokens = to.match(TOKEN) ?? [];
	const words = tokens.filter((token) => !SPACE.test(token));
	const keeps = kept(fromWords, words);

	// Each token's mark: a word's from the diff, a space's from its neighbours.
	const marks: boolean[] = [];
	let word = 0;
	for (const token of tokens) {
		if (SPACE.test(token)) {
			marks.push(false);
		} else {
			marks.push(!keeps[word]);
			word += 1;
		}
	}
	for (let index = 0; index < tokens.length; index += 1) {
		if (SPACE.test(tokens[index] as string)) {
			const before = index === 0 || (marks[index - 1] as boolean);
			const after = index === tokens.length - 1 || (marks[index + 1] as boolean);
			marks[index] = before && after;
		}
	}

	const runs: DiffRun[] = [];
	for (const [index, text] of tokens.entries()) {
		const added = marks[index] as boolean;
		const last = runs.at(-1);
		if (last && last.added === added) {
			last.text += text;
		} else {
			runs.push({ text, added });
		}
	}
	return runs;
}
