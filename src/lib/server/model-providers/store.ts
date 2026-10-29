import { and, asc, eq } from 'drizzle-orm';
import {
	type AdultLevel,
	bestProviders,
	eligibleProviders,
	HEALTHY,
	nextHealth,
	type ProviderHealth,
	type ProviderKind,
	type ProviderOverride,
	type ProviderState,
	type ReplyOutcome
} from '$lib/model-providers';
import type { Db } from '$lib/server/db';
import { modelProviders } from '$lib/server/db/schema';

/**
 * Reading and writing `model_providers` (docs/server-settings.md, "Adult
 * content by provider"). The rules are `$lib/model-providers`; this only
 * stores what they decide.
 */

type Key = { model: string; kind: ProviderKind };

/** The columns every read here needs, named rather than `select()`-ed whole. */
const STATE_COLUMNS = {
	provider: modelProviders.provider,
	levelPassed: modelProviders.levelPassed,
	checkedAt: modelProviders.checkedAt,
	override: modelProviders.override,
	listOrder: modelProviders.listOrder,
	refusalsInRow: modelProviders.refusalsInRow,
	errorsInRow: modelProviders.errorsInRow,
	successesInRow: modelProviders.successesInRow,
	refusalBackoffUntil: modelProviders.refusalBackoffUntil,
	errorBackoffUntil: modelProviders.errorBackoffUntil,
	lastReason: modelProviders.lastReason
};

type StateRow = {
	[K in keyof typeof STATE_COLUMNS]: (typeof modelProviders.$inferSelect)[K];
};

function healthOf(row: StateRow): ProviderHealth {
	return {
		refusalsInRow: row.refusalsInRow,
		errorsInRow: row.errorsInRow,
		successesInRow: row.successesInRow,
		refusalBackoffUntil: row.refusalBackoffUntil,
		errorBackoffUntil: row.errorBackoffUntil,
		lastReason: row.lastReason
	};
}

/** Every provider of this model and kind, cheapest first. */
export async function loadProviderStates(db: Db, key: Key): Promise<ProviderState[]> {
	const rows = await db
		.select(STATE_COLUMNS)
		.from(modelProviders)
		.where(and(eq(modelProviders.model, key.model), eq(modelProviders.kind, key.kind)))
		.orderBy(asc(modelProviders.listOrder));
	return rows.map((row) => ({
		provider: row.provider,
		levelPassed: row.levelPassed,
		checkedAt: row.checkedAt,
		override: row.override,
		health: healthOf(row),
		order: row.listOrder
	}));
}

/** Records a check's result, keeping the admin's override and the provider's health. */
export async function saveCheck(
	db: Db,
	key: Key,
	check: {
		provider: string;
		order: number;
		levelPassed: AdultLevel | null;
		at: Date;
		reason: string | null;
	}
): Promise<void> {
	const values = {
		levelPassed: check.levelPassed,
		checkedAt: check.at,
		listOrder: check.order,
		lastReason: check.reason
	};
	await db
		.insert(modelProviders)
		.values({ ...key, provider: check.provider, ...values })
		.onConflictDoUpdate({
			target: [modelProviders.model, modelProviders.provider, modelProviders.kind],
			set: values
		});
}

export async function setOverride(
	db: Db,
	key: Key,
	provider: string,
	override: ProviderOverride
): Promise<void> {
	await db
		.insert(modelProviders)
		.values({ ...key, provider, override })
		.onConflictDoUpdate({
			target: [modelProviders.model, modelProviders.provider, modelProviders.kind],
			set: { override }
		});
}

/**
 * Records one reply in use, moving the provider's health and back-off. Only
 * the kind and code of a rejection are kept, never anything of the request.
 */
export async function recordOutcome(
	db: Db,
	key: Key,
	provider: string,
	outcome: ReplyOutcome,
	now: Date,
	reason: string | null = null
): Promise<void> {
	const [row] = await db
		.select(STATE_COLUMNS)
		.from(modelProviders)
		.where(
			and(
				eq(modelProviders.model, key.model),
				eq(modelProviders.kind, key.kind),
				eq(modelProviders.provider, provider)
			)
		);
	const health = nextHealth(row ? healthOf(row) : HEALTHY, outcome, now, reason);
	await db
		.insert(modelProviders)
		.values({ ...key, provider, ...health })
		.onConflictDoUpdate({
			target: [modelProviders.model, modelProviders.provider, modelProviders.kind],
			set: health
		});
}

/** Where to send a request with content at this level: an ordered provider list, maybe empty. */
export async function routeFor(db: Db, key: Key, level: AdultLevel, now: Date): Promise<string[]> {
	return eligibleProviders(await loadProviderStates(db, key), level, now);
}

/**
 * The best tier of this model's providers (`bestProviders`), and whether the
 * model has been checked at all: unchecked, a request goes unpinned.
 */
export async function routeToBest(
	db: Db,
	key: Key,
	now: Date
): Promise<{ checked: boolean; providers: string[]; level: AdultLevel }> {
	const states = await loadProviderStates(db, key);
	return { checked: states.length > 0, ...bestProviders(states, now) };
}
