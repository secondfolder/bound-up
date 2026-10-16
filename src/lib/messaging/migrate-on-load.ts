/**
 * Starts moving each partnership's remaining old-scheme messages into its
 * vault, once per page load, in the background. Called by `EncryptionGate`
 * once vaults are open. See `vault-migration.ts`.
 *
 * Only for partnerships this device may write into: a vault whose keys the
 * trust check has been warned about gets nothing sealed into it, the same as
 * a send.
 */

import { writeGrantFor } from '../crypto/trust.svelte';
import { currentVaults } from '../crypto/vaults.svelte';
import { MigrationInterrupted, migratePartnershipToVault } from './vault-migration';

const started = new Set<string>();

export function migrateOpenPartnerships(identity: CryptoKey | string): void {
	const vaults = currentVaults();
	if (vaults.status !== 'ready') {
		return;
	}
	for (const [partnershipId, vault] of Object.entries(vaults.partnerships)) {
		const key = `${partnershipId}:${vault.id}`;
		if (started.has(key)) {
			continue;
		}
		const grant = writeGrantFor(partnershipId, vault.id);
		if (!grant) {
			continue;
		}
		started.add(key);
		// Housekeeping nobody is waiting on (docs/request-failures.md): a failure
		// is logged and the next page load tries again.
		void migratePartnershipToVault(partnershipId, identity, { vault, grant }).catch(
			(error: unknown) => {
				started.delete(key);
				if (!(error instanceof MigrationInterrupted)) {
					console.error('could not move messages into the vault', error);
				}
			}
		);
	}
}
