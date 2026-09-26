import { error } from '@sveltejs/kit';
import { desc, eq, or, sql } from 'drizzle-orm';
import { FEATURE_KEYS, FEATURES, type FeatureKey, type FeatureSource } from '../features';
import type { Db } from './db';
import { user, userFeatures } from './db/schema';

/**
 * The admin role check. Admins are Better Auth's admin plugin's `role` column;
 * see docs/features-and-admin.md.
 */

export function isAdmin(account: { role?: string | null } | null | undefined): boolean {
	return account?.role === 'admin';
}

/**
 * Returns the signed-in admin, or throws a 404 — not a 403, so that the admin
 * pages do not confirm they exist to anyone probing for them.
 *
 * Every admin load **and action** calls this. Form actions run before layout
 * loads, so the admin layout's own call does not gate them.
 */
export function requireAdmin<User extends { role?: string | null }>(locals: {
	user: User | null;
}): User {
	if (!(locals.user && isAdmin(locals.user))) {
		error(404, 'Not found');
	}
	return locals.user;
}

/** Rows the admin search shows. It finds an account; it is not a directory. */
export const ADMIN_SEARCH_LIMIT = 20;

export type AdminUserRow = { id: string; name: string; email: string; isAdmin: boolean };

/**
 * Accounts whose email or name contains `query`, case-insensitively — or, with
 * no query, the newest accounts, since the one being looked for has usually
 * just signed up.
 *
 * `instr` rather than `like`, so a `%` or `_` someone types is matched as
 * itself rather than as a wildcard, with no escaping to get wrong.
 */
export async function searchUsers(db: Db, query: string): Promise<AdminUserRow[]> {
	const needle = query.trim().toLowerCase();
	const rows = await db
		.select({ id: user.id, name: user.name, email: user.email, role: user.role })
		.from(user)
		.where(
			needle
				? or(
						sql`instr(lower(${user.email}), ${needle}) > 0`,
						sql`instr(lower(${user.name}), ${needle}) > 0`
					)
				: undefined
		)
		.orderBy(needle ? user.email : desc(user.createdAt), user.id)
		.limit(ADMIN_SEARCH_LIMIT);
	return rows.map(({ role, ...row }) => ({ ...row, isAdmin: isAdmin({ role }) }));
}

export type AdminFeatureRow = {
	key: FeatureKey;
	name: string;
	description: string;
	/** Null when the account does not hold it. */
	held: { source: FeatureSource; grantedAt: Date; grantedByName: string | null } | null;
};

export type AdminUserDetail = AdminUserRow & { features: AdminFeatureRow[] };

/** One account as the admin page shows it, or null if there is no such account. */
export async function getAdminUserDetail(db: Db, userId: string): Promise<AdminUserDetail | null> {
	const [account, holdings] = await Promise.all([
		db.query.user.findFirst({
			where: eq(user.id, userId),
			columns: { id: true, name: true, email: true, role: true }
		}),
		db
			.select({
				feature: userFeatures.feature,
				source: userFeatures.source,
				grantedAt: userFeatures.createdAt,
				grantedByName: user.name
			})
			.from(userFeatures)
			.leftJoin(user, eq(user.id, userFeatures.grantedByUserId))
			.where(eq(userFeatures.userId, userId))
	]);
	if (!account) {
		return null;
	}

	const { role, ...rest } = account;
	return {
		...rest,
		isAdmin: isAdmin({ role }),
		// Every registered feature, held or not, in registry order: the page is
		// where features get granted, so an unheld one needs a row too.
		features: FEATURE_KEYS.map((key) => {
			const holding = holdings.find((row) => row.feature === key);
			return {
				key,
				name: FEATURES[key].name,
				description: FEATURES[key].description,
				held: holding
					? {
							source: holding.source,
							grantedAt: holding.grantedAt,
							grantedByName: holding.grantedByName
						}
					: null
			};
		})
	};
}
