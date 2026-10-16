import { describe, expect, it } from 'vitest';
import { openRecord } from './crypto/sealed';
import { vaultFromKey } from './crypto/vault';
import fixtureFile from './sealed-fixtures/fixtures.json' with { type: 'json' };
import { ALL_SEALED_KINDS } from './sealed-kinds';

/**
 * Every version of every sealed kind still opens to what it always did. See
 * `sealed-fixtures/README.md` — never regenerate a fixture to pass this.
 */

type Fixture = {
	kind: string;
	version: number;
	recordId: string;
	ciphertext: string;
	expected: unknown;
};

const { vaultId, fixtures } = fixtureFile as { vaultId: string; fixtures: Fixture[] };

const vault = () =>
	vaultFromKey(new Uint8Array(Array.from({ length: 32 }, (_, i) => i)), {
		id: vaultId,
		kind: 'partnership',
		partnershipId: 'fixtures'
	});

describe('sealed fixtures', () => {
	for (const kind of ALL_SEALED_KINDS) {
		for (const { version } of kind.versions) {
			it(`${kind.name} v${version} still opens`, async () => {
				const fixture = fixtures.find(
					(candidate) => candidate.kind === kind.name && candidate.version === version
				);
				expect(fixture, `no fixture for ${kind.name} v${version} — see the README`).toBeDefined();
				if (!fixture) {
					return;
				}
				const opened = await openRecord(kind, {
					recordId: fixture.recordId,
					ciphertext: fixture.ciphertext,
					payloadVersion: version,
					vault: await vault()
				});
				expect(opened).toEqual(fixture.expected);
			});
		}
	}

	it('has no fixture for a kind or version that does not exist', () => {
		for (const fixture of fixtures) {
			const kind = ALL_SEALED_KINDS.find((candidate) => candidate.name === fixture.kind);
			expect(kind?.versions.some((entry) => entry.version === fixture.version)).toBe(true);
		}
	});
});
