import { describe, expect, it } from 'vitest';
import { describePasskeyFailure } from './passkey';

describe('describePasskeyFailure', () => {
	it('still says something when nothing answered', () => {
		// The bug this replaced: WebAuthn reports a cancel, a timeout and an
		// absent credential identically on purpose, so treating the first as
		// "nothing to report" made the third look like a dead button.
		const failure = describePasskeyFailure(
			new DOMException('The operation either timed out or was not allowed', 'NotAllowedError')
		);
		expect(failure.kind).toBe('no-assertion');
		expect(failure.message).not.toBe('');
	});

	/**
	 * `@simplewebauthn/browser` rethrows the browser's error as its own
	 * `WebAuthnError`, keeping the name — which is what the ceremonies in
	 * `passkey-ceremony.ts` now surface.
	 */
	it('recognises a dismissal rethrown by the WebAuthn helpers', () => {
		const rethrown = Object.assign(new Error('The operation was not allowed'), {
			name: 'NotAllowedError'
		});
		expect(describePasskeyFailure(rethrown).kind).toBe('no-assertion');
	});

	it('keeps a message nobody predicted, verbatim', () => {
		const failure = describePasskeyFailure(new Error('something else entirely'));
		expect(failure).toEqual({ kind: 'unknown', message: 'something else entirely' });
	});

	it('survives something that is not an Error at all', () => {
		expect(describePasskeyFailure('gone wrong')).toEqual({
			kind: 'unknown',
			message: 'gone wrong'
		});
	});
});
