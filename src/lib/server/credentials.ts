import { and, eq } from 'drizzle-orm';
import type { Db } from './db';
import { account } from './db/schema';

/**
 * Setting a password credential that Better Auth's API cannot set.
 *
 * Reading and writing the `account` table directly is fine — it is
 * `schema/auth.ts` that is generated and must not be hand-edited (invariant 7),
 * not the data in it. Scoped to one user and to the `credential` provider row.
 */

/** Better Auth's provider id for an email-and-password credential. */
const CREDENTIAL_PROVIDER = 'credential';

/**
 * The statement that replaces a user's password hash, for a `db.batch()`.
 *
 * For a partner-assisted sign-in, and nothing else: the user has lost their
 * password, so `changePassword` (which needs the old one) cannot help, and
 * `setPassword` refuses an account that already has one. There is no
 * reset-by-email flow in this app — no mailer, so `requestPasswordReset` has
 * no handler to call.
 *
 * `hash` must come from Better Auth's own `password.hash`, so sign-in can
 * verify it exactly as it verifies any other credential. Returned as a query
 * rather than run, so the caller can apply it in the same batch as the new
 * keys — a password that opens nothing, or keys nothing can sign in to, are
 * both worse than neither. See `server/recovery.ts`.
 */
export function setPasswordHashStatement(db: Db, userId: string, hash: string) {
	return db
		.update(account)
		.set({ password: hash, updatedAt: new Date() })
		.where(and(eq(account.userId, userId), eq(account.providerId, CREDENTIAL_PROVIDER)));
}
