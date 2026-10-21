import { describe, expect, it, vi } from 'vitest';
import { toBase64, toBase64Url } from '../encryption';
import { ADA_IDENTITY, ADA_RECIPIENT, JUN_IDENTITY, JUN_RECIPIENT } from '../testing/crypto';
import { defined } from '../testing/defined';
import type { VaultListingView } from '../types';
import {
	type EnsureVaultsDeps,
	ensureVaults,
	StaleIdentityError,
	type VaultCreation
} from './ensure-vaults';
import { decryptBytes, encryptBytesTo, openUnderShare } from './escrow';
import { generateAgeIdentity, loadAge } from './identity';
import {
	deriveVaultKeys,
	generateVaultKey,
	unwrapSelfVaultKey,
	unwrapVaultKey,
	wrapVaultKey
} from './vault';

/** The fake server's share: the same function it uses. */
async function shareOf(escrowId: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(escrowId));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A pretend server: holds vaults and wraps the way the real one does, so the
 * two partners' devices can be run against the same state in turn.
 */
function fakeServer() {
	type Stored = {
		id: string;
		kind: 'self' | 'partnership';
		owner: string | null;
		partnershipId: string | null;
		keyCheck: string;
		wraps: Map<string, { ciphertext: string; forRecipient: string }>;
	};
	const vaults: Stored[] = [];
	/** Own-vault escrows, by owner. One per partner — there is only one partner here. */
	const escrows = new Map<string, { id: string; ciphertext: string }>();
	const relays: { owner: string; escrowId: string; ciphertext: string }[] = [];
	const recipients = new Map([
		['ada', ADA_RECIPIENT],
		['jun', JUN_RECIPIENT]
	]);
	const partnershipId = 'p1';

	function currentWrap(vault: Stored, userId: string) {
		const wrap = vault.wraps.get(userId);
		return wrap && wrap.forRecipient === recipients.get(userId) ? wrap : null;
	}

	/** Stands in for the HMAC: any fixed function of the id will do here. */
	async function share(escrowId: string): Promise<string> {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(escrowId));
		return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	}

	function listing(userId: string): VaultListingView {
		const self = vaults.find((v) => v.kind === 'self' && v.owner === userId);
		const shared = vaults.find((v) => v.partnershipId === partnershipId);
		const partnerId = userId === 'ada' ? 'jun' : 'ada';
		return {
			recipient: defined(recipients.get(userId), 'recipient'),
			self: self
				? {
						id: self.id,
						kind: 'self',
						partnershipId: null,
						keyCheck: self.keyCheck,
						// Only the wrap for the key the user has now, as the real listing.
						wrap: currentWrap(self, userId),
						escrowPartnershipIds: escrows.has(userId) ? [partnershipId] : []
					}
				: null,
			partnerships: [
				{
					partnershipId,
					partnerId,
					recipients: {
						mine: defined(recipients.get(userId), 'mine'),
						theirs: defined(recipients.get(partnerId), 'theirs'),
						vaultCheck: shared?.keyCheck ?? null
					},
					vault: shared
						? {
								id: shared.id,
								kind: 'partnership',
								partnershipId,
								keyCheck: shared.keyCheck,
								wrap: currentWrap(shared, userId),
								partnerWrapFor: shared.wraps.get(partnerId)?.forRecipient ?? null
							}
						: null
				}
			]
		};
	}

	function deps(
		userId: string,
		identity: string,
		overrides: Partial<EnsureVaultsDeps> = {}
	): EnsureVaultsDeps & { created: VaultCreation[] } {
		const created: VaultCreation[] = [];
		return {
			created,
			userId,
			identity: { recipient: defined(recipients.get(userId), 'recipient'), identity },
			list: () => Promise.resolve(listing(userId)),
			create: (vault) => {
				const scopeTaken = vaults.some((v) =>
					vault.kind === 'self'
						? v.kind === 'self' && v.owner === userId
						: v.partnershipId === vault.partnershipId
				);
				if (scopeTaken) {
					return Promise.resolve('exists');
				}
				created.push(vault);
				vaults.push({
					id: vault.id,
					kind: vault.kind,
					owner: vault.kind === 'self' ? userId : null,
					partnershipId: vault.kind === 'partnership' ? vault.partnershipId : null,
					keyCheck: vault.keyCheck,
					wraps: new Map(vault.wraps.map((wrap) => [wrap.userId, wrap]))
				});
				return Promise.resolve('created');
			},
			putWrap: (vaultId, wrap) => {
				vaults.find((v) => v.id === vaultId)?.wraps.set(wrap.userId, wrap);
				return Promise.resolve();
			},
			trustAllows: () => Promise.resolve(true),
			report: () => undefined,
			escrow: {
				issueShare: (escrowId) => share(escrowId),
				put: (escrow) => {
					escrows.set(userId, { id: escrow.id, ciphertext: escrow.ciphertext });
					return Promise.resolve();
				},
				release: async () =>
					await Promise.all(
						relays
							.filter((relay) => relay.owner === userId)
							.map(async (relay) => ({ ...relay, share: await share(relay.escrowId) }))
					),
				deleteAll: () => {
					escrows.delete(userId);
					return Promise.resolve();
				},
				deleteLostSelfVault: () => {
					const index = vaults.findIndex((v) => v.kind === 'self' && v.owner === userId);
					const vault = vaults[index];
					if (!vault || currentWrap(vault, userId) || escrows.has(userId)) {
						return Promise.resolve(false);
					}
					vaults.splice(index, 1);
					return Promise.resolve(true);
				}
			},
			...overrides
		};
	}

	return { vaults, recipients, escrows, relays, deps, partnershipId };
}

describe('ensureVaults', () => {
	it('creates a self vault and a partnership vault the first time, and opens them', async () => {
		const server = fakeServer();
		const ada = server.deps('ada', ADA_IDENTITY);
		const opened = await ensureVaults(ada);

		expect(ada.created.map((vault) => vault.kind)).toEqual(['self', 'partnership']);
		expect(opened.self?.kind).toBe('self');
		expect(opened.partnerships[server.partnershipId]?.kind).toBe('partnership');
	});

	/** The point of a partnership vault: both partners open the same key. */
	it('lets the partner open the vault the first device made, without making another', async () => {
		const server = fakeServer();
		const fromAda = await ensureVaults(server.deps('ada', ADA_IDENTITY));
		const jun = server.deps('jun', JUN_IDENTITY);
		const fromJun = await ensureVaults(jun);

		expect(jun.created.map((vault) => vault.kind)).toEqual(['self']);
		expect(fromJun.partnerships[server.partnershipId]?.keyCheck).toBe(
			fromAda.partnerships[server.partnershipId]?.keyCheck
		);
	});

	/** A device that loses the race opens the winner's vault rather than giving up. */
	it('opens the winner’s vault when another device created one first', async () => {
		const server = fakeServer();
		const jun = server.deps('jun', JUN_IDENTITY);
		const ada = server.deps('ada', ADA_IDENTITY);
		const { create } = ada;
		let raced = false;
		ada.create = async (vault) => {
			if (vault.kind === 'partnership' && !raced) {
				// Jun's device gets there between Ada's listing and Ada's create.
				raced = true;
				await ensureVaults(jun);
			}
			return await create(vault);
		};
		const opened = await ensureVaults(ada);
		expect(raced).toBe(true);
		const shared = defined(
			server.vaults.find((v) => v.partnershipId === server.partnershipId),
			'the shared vault'
		);
		expect(opened.partnerships[server.partnershipId]?.id).toBe(shared.id);
	});

	it('does not create or wrap for a partner whose key this device has been warned about', async () => {
		const server = fakeServer();
		const ada = server.deps('ada', ADA_IDENTITY, { trustAllows: () => Promise.resolve(false) });
		const opened = await ensureVaults(ada);
		expect(ada.created.map((vault) => vault.kind)).toEqual(['self']);
		expect(opened.partnerships).toEqual({});
	});

	/**
	 * A server serving a key of its own as the user's, for one partnership only,
	 * so the listing's own recipient still matches the device. Creating the
	 * vault would wrap its key to the server.
	 */
	it('writes nothing to a key the server says is the user’s own when it is not', async () => {
		const server = fakeServer();
		const impostor = await generateAgeIdentity();
		const report = vi.fn();
		const honest = server.deps('ada', ADA_IDENTITY);
		const ada = server.deps('ada', ADA_IDENTITY, {
			report,
			list: async () => {
				const listing = await honest.list();
				return {
					...listing,
					partnerships: listing.partnerships.map((entry) => ({
						...entry,
						recipients: { ...entry.recipients, mine: impostor.recipient }
					}))
				};
			}
		});
		const opened = await ensureVaults(ada);

		expect(ada.created.map((vault) => vault.kind)).toEqual(['self']);
		expect(opened.partnerships).toEqual({});
		expect(server.escrows.size).toBe(0);
		const wrappedTo = server.vaults.flatMap((v) =>
			[...v.wraps.values()].map((w) => w.forRecipient)
		);
		expect(wrappedTo).not.toContain(impostor.recipient);
		expect(report).toHaveBeenCalledWith(expect.stringContaining('not theirs'));
	});

	it('wraps a vault it creates to the key it holds', async () => {
		const server = fakeServer();
		const ada = server.deps('ada', ADA_IDENTITY);
		await ensureVaults(ada);
		const partnership = defined(
			ada.created.find((vault) => vault.kind === 'partnership'),
			'the partnership vault'
		);
		expect(partnership.wraps.map((wrap) => [wrap.userId, wrap.forRecipient])).toEqual([
			['ada', ADA_RECIPIENT],
			['jun', JUN_RECIPIENT]
		]);
	});

	describe('the own vault', () => {
		/** Puts a self vault for Ada in the fake server, with whatever wrap it is given. */
		async function plantSelfVault(
			server: ReturnType<typeof fakeServer>,
			wrap: (vault: { id: string; raw: Uint8Array<ArrayBuffer> }) => Promise<string>
		) {
			const id = crypto.randomUUID();
			const raw = generateVaultKey();
			const { keyCheck } = await deriveVaultKeys(raw);
			server.vaults.push({
				id,
				kind: 'self',
				owner: 'ada',
				partnershipId: null,
				keyCheck,
				wraps: new Map([
					['ada', { ciphertext: await wrap({ id, raw }), forRecipient: ADA_RECIPIENT }]
				])
			});
			return { id, keyCheck };
		}

		/**
		 * A server making a vault of its own, which it can wrap to Ada's public
		 * recipient and fingerprint correctly. Everything sealed in it would be
		 * the server's to read.
		 */
		it('does not open a self vault the server made up', async () => {
			const server = fakeServer();
			await plantSelfVault(server, async ({ id, raw }) => {
				const age = await loadAge();
				const encrypter = new age.Encrypter();
				encrypter.addRecipient(ADA_RECIPIENT);
				const payload = { v: 2, vaultId: id, key: toBase64Url(raw), mac: 'A'.repeat(43) };
				return toBase64(await encrypter.encrypt(new TextEncoder().encode(JSON.stringify(payload))));
			});
			const report = vi.fn();
			const opened = await ensureVaults(server.deps('ada', ADA_IDENTITY, { report }));

			expect(opened.self).toBeNull();
			expect(report).toHaveBeenCalledWith(expect.stringContaining('self vault'));
			// Nor is it handed to the partner in escrow.
			expect(server.escrows.size).toBe(0);
		});

		it('upgrades a wrap from before the MAC as it opens it', async () => {
			const server = fakeServer();
			const planted = await plantSelfVault(
				server,
				async ({ id, raw }) => await wrapVaultKey({ vaultId: id, raw, recipient: ADA_RECIPIENT })
			);
			const opened = await ensureVaults(server.deps('ada', ADA_IDENTITY));

			expect(opened.self?.id).toBe(planted.id);
			const wrap = defined(
				server.vaults.find((v) => v.id === planted.id)?.wraps.get('ada'),
				"ada's wrap"
			);
			await expect(
				unwrapSelfVaultKey({
					ciphertext: wrap.ciphertext,
					identity: ADA_IDENTITY,
					recipient: ADA_RECIPIENT,
					vault: planted
				})
			).resolves.toMatchObject({ legacy: false });
		});

		it('is made with a wrap that carries the MAC', async () => {
			const server = fakeServer();
			const ada = server.deps('ada', ADA_IDENTITY);
			await ensureVaults(ada);
			const self = defined(
				ada.created.find((vault) => vault.kind === 'self'),
				'the self vault'
			);
			await expect(
				unwrapSelfVaultKey({
					ciphertext: defined(self.wraps[0], 'its wrap').ciphertext,
					identity: ADA_IDENTITY,
					recipient: ADA_RECIPIENT,
					vault: self
				})
			).resolves.toMatchObject({ legacy: false });
		});
	});

	/** After a partner-assisted sign-in: the partner's wrap is for the key they lost. */
	it('wraps again for a partner whose wrap is for a key they no longer have', async () => {
		const server = fakeServer();
		const fromAda = await ensureVaults(server.deps('ada', ADA_IDENTITY));
		const shared = defined(fromAda.partnerships[server.partnershipId], 'shared vault');

		const fresh = await generateAgeIdentity();
		server.recipients.set('jun', fresh.recipient);

		await ensureVaults(server.deps('ada', ADA_IDENTITY));
		const wrap = defined(
			server.vaults.find((v) => v.id === shared.id)?.wraps.get('jun'),
			"jun's new wrap"
		);
		expect(wrap.forRecipient).toBe(fresh.recipient);
		expect(
			await unwrapVaultKey({ ciphertext: wrap.ciphertext, identity: fresh.identity, vault: shared })
		).not.toBeNull();
	});

	/** A server pairing a real wrap with a made-up vault row. */
	it('reports a wrap that should open and does not, and carries on', async () => {
		const server = fakeServer();
		await ensureVaults(server.deps('ada', ADA_IDENTITY));
		for (const vault of server.vaults) {
			vault.keyCheck = 'B'.repeat(43);
		}
		const report = vi.fn();
		const opened = await ensureVaults(server.deps('ada', ADA_IDENTITY, { report }));
		expect(opened.self).toBeNull();
		expect(opened.partnerships).toEqual({});
		expect(report).toHaveBeenCalledTimes(2);
	});

	/** After a partner-assisted sign-in elsewhere, this device's key is the old one. */
	it('opens nothing, with an error the caller can stay quiet about, on a stale identity', async () => {
		const server = fakeServer();
		server.recipients.set('ada', (await generateAgeIdentity()).recipient);
		const ada = server.deps('ada', ADA_IDENTITY, {
			identity: { recipient: ADA_RECIPIENT, identity: ADA_IDENTITY }
		});
		await expect(ensureVaults(ada)).rejects.toBeInstanceOf(StaleIdentityError);
		expect(ada.created).toEqual([]);
	});

	it('pins a vault it has just created', async () => {
		const server = fakeServer();
		const trustAllows = vi.fn(() => Promise.resolve(true));
		await ensureVaults(server.deps('ada', ADA_IDENTITY, { trustAllows }));
		const shared = defined(
			server.vaults.find((v) => v.partnershipId === server.partnershipId),
			'shared vault'
		);
		expect(trustAllows).toHaveBeenLastCalledWith(
			server.partnershipId,
			expect.objectContaining({ vaultCheck: shared.keyCheck })
		);
	});

	describe('the own vault, in escrow', () => {
		it('is held in escrow with the partner, who can open only their half', async () => {
			const server = fakeServer();
			const { self } = await ensureVaults(server.deps('ada', ADA_IDENTITY));
			const escrow = defined(server.escrows.get('ada'), "ada's escrow");

			// Jun's layer opens with Jun's key — and leaves the share's layer shut.
			const inner = defined(await decryptBytes(escrow.ciphertext, JUN_IDENTITY), 'inner layer');
			const vault = defined(self, 'self vault');
			await expect(openUnderShare({ inner, share: 'f'.repeat(64), vault })).resolves.toBeNull();
			// With the real share it is the vault's key.
			const raw = await openUnderShare({
				inner,
				share: await shareOf(escrow.id),
				vault
			});
			expect(raw).not.toBeNull();
			// Ada cannot open the partner's layer herself.
			await expect(decryptBytes(escrow.ciphertext, ADA_IDENTITY)).resolves.toBeNull();
		});

		/**
		 * Ada lost every way in. Jun's device passed on its half, re-encrypted to
		 * her new key; the server released its share. Her new device gets the
		 * same vault back, and the escrows are made again.
		 */
		it('comes back after a partner-assisted sign-in, and is escrowed afresh', async () => {
			const server = fakeServer();
			const before = defined(
				(await ensureVaults(server.deps('ada', ADA_IDENTITY))).self,
				'self vault'
			);
			const old = defined(server.escrows.get('ada'), 'old escrow');

			const fresh = await generateAgeIdentity();
			server.recipients.set('ada', fresh.recipient);
			const inner = defined(await decryptBytes(old.ciphertext, JUN_IDENTITY), 'inner');
			server.relays.push({
				owner: 'ada',
				escrowId: old.id,
				ciphertext: await encryptBytesTo(inner, fresh.recipient)
			});

			const after = await ensureVaults(server.deps('ada', fresh.identity));
			expect(after.self?.id).toBe(before.id);
			expect(after.self?.keyCheck).toBe(before.keyCheck);
			const renewed = defined(server.escrows.get('ada'), 'new escrow');
			expect(renewed.id).not.toBe(old.id);
		});

		it('is replaced when nothing can ever bring it back', async () => {
			const server = fakeServer();
			// No escrow: trust never allowed one.
			const before = defined(
				(
					await ensureVaults(
						server.deps('ada', ADA_IDENTITY, { trustAllows: () => Promise.resolve(false) })
					)
				).self,
				'self vault'
			);
			const fresh = await generateAgeIdentity();
			server.recipients.set('ada', fresh.recipient);

			const after = await ensureVaults(
				server.deps('ada', fresh.identity, { trustAllows: () => Promise.resolve(false) })
			);
			expect(after.self?.id).toBeDefined();
			expect(after.self?.id).not.toBe(before.id);
		});

		it('waits, rather than replacing, while an escrow could still bring it back', async () => {
			const server = fakeServer();
			const before = defined(
				(await ensureVaults(server.deps('ada', ADA_IDENTITY))).self,
				'self vault'
			);
			const fresh = await generateAgeIdentity();
			server.recipients.set('ada', fresh.recipient);

			const after = await ensureVaults(server.deps('ada', fresh.identity));
			expect(after.self).toBeNull();
			expect(server.vaults.some((vault) => vault.id === before.id)).toBe(true);
		});
	});
});
