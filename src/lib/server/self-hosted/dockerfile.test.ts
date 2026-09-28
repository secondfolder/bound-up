import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_REQUEST_BYTES } from '../../../routes/api/partnerships/[id]/send';

/** adapter-node's own parsing of BODY_SIZE_LIMIT: bytes, or a K, M or G suffix. */
function parseSize(value: string): number {
	const match: RegExpExecArray | null = /^(?<digits>\d+)(?<unit>[KMG]?)$/i.exec(value);
	if (!match?.groups) {
		throw new Error(`Not a size adapter-node understands: ${value}`);
	}
	const { digits = '', unit = '' } = match.groups;
	const multiplier = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[unit.toUpperCase()] ?? 1;
	return Number(digits) * multiplier;
}

describe('Dockerfile', () => {
	// adapter-node's default of 512 KB would refuse every message with a photo
	// in it, as a bare 413 before the route's own, clearer cap is reached. This
	// keeps the two in step when the attachment budget moves.
	it('lets through every request the send routes accept', () => {
		const dockerfile = readFileSync('Dockerfile', 'utf8');
		const match: RegExpExecArray | null = /BODY_SIZE_LIMIT=(?<size>\S+)/.exec(dockerfile);
		expect(match, 'the Dockerfile sets BODY_SIZE_LIMIT').not.toBeNull();
		expect(parseSize(match?.groups?.size ?? '')).toBeGreaterThanOrEqual(MAX_REQUEST_BYTES);
	});
});
