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

	// The image's version reaches the app only through this variable (see
	// src/lib/server/app-version.ts), and the VERSION arg has to stay in the last
	// layer so the released image is the one CI tested.
	it('hands the release version to the app at runtime, from the last layer', () => {
		const dockerfile = readFileSync('Dockerfile', 'utf8');
		const lastStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
		const tail = lastStage.slice(lastStage.indexOf('ARG VERSION'));
		expect(lastStage, 'the VERSION arg is in the runtime stage').toContain('ARG VERSION');
		// biome-ignore lint/suspicious/noTemplateCurlyInString: a Dockerfile variable, matched as text.
		expect(tail).toContain('ENV APP_VERSION="${VERSION}"');
		expect(tail, 'nothing but metadata follows the VERSION arg').not.toMatch(
			/^(?:RUN|COPY|ADD)\b/m
		);
	});
});
