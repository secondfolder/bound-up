import type { SealedRefView } from '../types';

/**
 * Sealed records whose content a component test simply decides.
 *
 * Every user-authored field is sealed, so a component shows a title or a
 * name only once `sealedReader` has opened it, under a vault the test browser
 * does not have. The real opening is covered by `sealed-cache.svelte.test.ts`
 * and the frozen fixtures; a component test is about what is done with the
 * content, so it registers the content here and opens it by record id. A test
 * file opts in by mocking the two seams the reader goes through:
 *
 *     vi.mock('$lib/crypto/sealed', async (importOriginal) => ({
 *         ...(await importOriginal<typeof import('$lib/crypto/sealed')>()),
 *         openRecord: (await import('$lib/testing/sealed-refs')).openTestRecord
 *     }));
 *     vi.mock('$lib/crypto/vaults.svelte', async (importOriginal) => ({
 *         ...(await importOriginal<typeof import('$lib/crypto/vaults.svelte')>()),
 *         vaultById: (id: string) => ({ id })
 *     }));
 *
 * Opening is still asynchronous, as it is in the app: a test waits for the
 * content (`findBy…`, `vi.waitFor`) rather than reading it straight after
 * rendering.
 *
 * Deliberately free of `crypto/sealed` and `crypto/vaults.svelte`, which the
 * test files above mock with this module's help.
 */

const contents = new Map<string, unknown>();

/** The vault every test record names. The mocked `vaultById` answers for any id. */
export const TEST_VAULT_ID = '00000000-0000-4000-8000-00000000f00d';

/**
 * A sealed record that opens to `content`.
 *
 * The ciphertext is the content itself, so the same content makes the same
 * reference — a test can build its expected value the same way as its input
 * — while different content under one record id never shares a cache entry
 * in the reader, which is one per page and so shared by every test in a file.
 */
export function testSealedRef(
	content: unknown,
	recordId: string = crypto.randomUUID()
): SealedRefView {
	const ciphertext = `test-sealed:${JSON.stringify(content)}`;
	contents.set(`${recordId}\0${ciphertext}`, content);
	return { recordId, vaultId: TEST_VAULT_ID, ciphertext, payloadVersion: 1 };
}

/** The mocked `openRecord`: what the record was registered with, or null for a stranger. */
export function openTestRecord(
	_kind: unknown,
	input: { recordId: string; ciphertext: string }
): Promise<unknown> {
	return Promise.resolve(contents.get(`${input.recordId}\0${input.ciphertext}`) ?? null);
}
