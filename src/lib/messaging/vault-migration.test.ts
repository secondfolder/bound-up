import { describe, expect, it } from 'vitest';
import { encryptPayload } from '../crypto/messages';
import { openRecord } from '../crypto/sealed';
import { generateVaultKey, vaultFromKey } from '../crypto/vault';
import { issueWriteGrant } from '../crypto/write-grant';
import { looksLikeRichTextDocument } from '../richtext';
import {
	messageBodyKind,
	messageMetadataKind,
	messageReactionKind
} from '../sealed-kinds/messages';
import { ADA_IDENTITY, ADA_RECIPIENT, JUN_RECIPIENT, STRANGER_RECIPIENT } from '../testing/crypto';
import { defined } from '../testing/defined';
import { type MigrationDeps, migrateToVault } from './vault-migration';

/**
 * Moving rows from the original scheme into the vault, against a pretend
 * server and real cryptography: what is posted must open under the vault and
 * say what the original said.
 */

const doc = JSON.stringify({
	root: {
		type: 'root',
		children: [{ type: 'paragraph', children: [{ type: 'text', text: 'hello', format: 0 }] }]
	}
});

async function setUp() {
	const vault = await vaultFromKey(generateVaultKey(), {
		id: crypto.randomUUID(),
		kind: 'partnership',
		partnershipId: 'p1'
	});
	const keys = { vault, grant: issueWriteGrant(vault.id) };
	const both = [ADA_RECIPIENT, JUN_RECIPIENT];
	const posted: Parameters<MigrationDeps['postSealed']>[0][] = [];
	return { vault, keys, both, posted };
}

describe('migrateToVault', () => {
	it('re-seals bodies, sidecars and reactions so the vault opens them, with the same content', async () => {
		const { vault, keys, both, posted } = await setUp();
		const embed = {
			href: 'https://example.com/',
			fetchedAt: 1,
			kind: 'card' as const,
			providerName: null,
			title: 'A page',
			description: null,
			thumbnailUrl: null,
			canonicalUrl: null,
			imageUrl: null,
			iframeSrc: null,
			iframeHeight: null,
			faviconUrl: null,
			themeColor: null
		};
		const sealed = await migrateToVault(ADA_IDENTITY, keys, {
			fetchPage: async () => ({
				messages: [
					{
						id: 'm1',
						ciphertext: await encryptPayload({ version: 1, text: doc, attachments: [] }, both),
						metadataCiphertext: await encryptPayload({ version: 1, embeds: [embed] }, both)
					}
				],
				reactions: [
					{ id: 'r1', ciphertext: await encryptPayload({ version: 1, emoji: '🔥' }, both) }
				],
				next: null
			}),
			postSealed: (batch) => {
				posted.push(batch);
				return Promise.resolve();
			}
		});

		expect(sealed).toBe(2);
		const [first] = posted;
		const message = defined(first?.messages[0], 'sealed message');
		expect(first?.vaultId).toBe(vault.id);
		await expect(
			openRecord(messageBodyKind, {
				recordId: 'm1',
				ciphertext: message.ciphertext,
				payloadVersion: message.payloadVersion,
				vault
			})
		).resolves.toEqual({ text: doc, attachments: [] });
		await expect(
			openRecord(messageMetadataKind, {
				recordId: 'm1',
				ciphertext: defined(message.metadataCiphertext, 'sidecar'),
				payloadVersion: defined(message.metadataVersion, 'version'),
				vault
			})
		).resolves.toEqual({ embeds: [embed] });
		const reaction = defined(first?.reactions[0], 'sealed reaction');
		await expect(
			openRecord(messageReactionKind, {
				recordId: 'r1',
				ciphertext: reaction.ciphertext,
				payloadVersion: reaction.payloadVersion,
				vault
			})
		).resolves.toEqual({ emoji: '🔥' });
	});

	/** It decrypts every body anyway, so nothing that goes into a vault is plain text. */
	it('converts a body written before rich text as it seals it', async () => {
		const { vault, keys, both, posted } = await setUp();
		await migrateToVault(ADA_IDENTITY, keys, {
			fetchPage: async () => ({
				messages: [
					{
						id: 'm1',
						ciphertext: await encryptPayload(
							{ version: 1, text: 'just *plain* text', attachments: [] },
							both
						),
						metadataCiphertext: null
					}
				],
				reactions: [],
				next: null
			}),
			postSealed: (batch) => {
				posted.push(batch);
				return Promise.resolve();
			}
		});
		const message = defined(posted[0]?.messages[0], 'sealed message');
		const opened = defined(
			await openRecord(messageBodyKind, {
				recordId: 'm1',
				ciphertext: message.ciphertext,
				payloadVersion: message.payloadVersion,
				vault
			}),
			'opened body'
		);
		expect(looksLikeRichTextDocument(opened.text)).toBe(true);
		expect(opened.text).toContain('just');
	});

	/** Encrypted to keys this device does not hold: left for the other partner's device. */
	it('skips what it cannot open, and keeps paging past it', async () => {
		const { keys, both, posted } = await setUp();
		const pages = [
			{
				messages: [
					{
						id: 'not-mine',
						ciphertext: await encryptPayload({ version: 1, text: doc, attachments: [] }, [
							STRANGER_RECIPIENT
						]),
						metadataCiphertext: null
					}
				],
				reactions: [],
				next: { messagesAfter: 'not-mine', reactionsAfter: null }
			},
			{
				messages: [
					{
						id: 'm2',
						ciphertext: await encryptPayload({ version: 1, text: doc, attachments: [] }, both),
						metadataCiphertext: null
					}
				],
				reactions: [],
				next: null
			}
		];
		const asked: unknown[] = [];
		const sealed = await migrateToVault(ADA_IDENTITY, keys, {
			fetchPage: (after) => {
				asked.push(after);
				return Promise.resolve(defined(pages[asked.length - 1], 'page'));
			},
			postSealed: (batch) => {
				posted.push(batch);
				return Promise.resolve();
			}
		});
		expect(sealed).toBe(1);
		expect(asked).toEqual([
			{ messagesAfter: null, reactionsAfter: null },
			{ messagesAfter: 'not-mine', reactionsAfter: null }
		]);
		expect(posted.flatMap((batch) => batch.messages.map((message) => message.id))).toEqual(['m2']);
	});
});
