/**
 * The answer encoding shared by Goctionni's KinkList and the lists built on
 * it (adhesiveCheese's kinklist, KinkSheet, Not Lewd Just Kinky): every
 * answer, in the list's own order, packed into the URL's hash.
 *
 * A port of their `decode` / `decodeChunk`, which are identical on every one
 * of those sites (checked when this was written, against each site's source).
 * Each 8-character chunk is a number in base 72 over `HASH_CHARS`, holding as
 * many answers as fit, least significant first, in base `levels` — the number
 * of answer levels the list has, "not entered" included.
 */

export const HASH_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.=+*^!@';

function maxPow(base: number, maxValue: number): number {
	let result = 1;
	for (let pow = 1; base ** pow <= maxValue; pow += 1) {
		result = pow;
	}
	return result;
}

const HASH_BASE = HASH_CHARS.length;
const OUTPUT_POW = maxPow(HASH_BASE, Number.MAX_SAFE_INTEGER);

const LEADING_HASH = /^#/;

/** How long each chunk of a hash is: 8 characters. */
export const CHUNK_LENGTH = OUTPUT_POW;

/** How many answers one chunk holds, for a list with this many levels. */
export function answersPerChunk(levels: number): number {
	return maxPow(levels, HASH_BASE ** OUTPUT_POW);
}

/** The answers a hash holds, in the list's order. Null for a hash with characters no list writes. */
export function decodeKinklistHash(hash: string, levels: number): number[] | null {
	const text = hash.replace(LEADING_HASH, '');
	if (text.length === 0 || [...text].some((char) => !HASH_CHARS.includes(char))) {
		return null;
	}
	const inputPow = answersPerChunk(levels);
	const values: number[] = [];
	for (let start = 0; start < text.length; start += OUTPUT_POW) {
		const chunk = text.slice(start, start + OUTPUT_POW);
		let chunkInt = 0;
		for (let index = 0; index < chunk.length; index += 1) {
			chunkInt += HASH_CHARS.indexOf(chunk[index] ?? '') * HASH_BASE ** (chunk.length - 1 - index);
		}
		const digits: number[] = [];
		for (let pow = inputPow - 1; pow >= 0; pow -= 1) {
			const place = Math.floor(levels ** pow);
			const digit = Math.floor(chunkInt / place);
			digits.push(digit);
			chunkInt -= place * digit;
		}
		values.push(...digits.reverse());
	}
	return values;
}

/**
 * The other direction, for tests: what one of those sites would put in the
 * hash for these answers. A port of their `encode`.
 */
export function encodeKinklistHash(values: readonly number[], levels: number): string {
	const inputPow = answersPerChunk(levels);
	let output = '';
	for (let start = 0; start < values.length; start += inputPow) {
		let chunkInt = 0;
		for (let pow = 0; pow < inputPow; pow += 1) {
			const value = values[start + pow];
			if (value === undefined) {
				break;
			}
			chunkInt += value * levels ** pow;
		}
		let chunk = '';
		while (chunkInt > 0) {
			const pow = Math.floor(Math.log(chunkInt) / Math.log(HASH_BASE));
			const place = HASH_BASE ** pow;
			const digit = Math.floor(chunkInt / place);
			chunk += HASH_CHARS[digit];
			chunkInt -= digit * place;
		}
		output += chunk.padStart(OUTPUT_POW, HASH_CHARS[0]);
	}
	return output;
}
