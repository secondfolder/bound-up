/**
 * Features an account can be given, and the pure rules around them.
 *
 * Alias-free, like `types.ts`: the Drizzle schema imports `FeatureKey` and
 * `FeatureSource` from here, and drizzle-kit loads the schema outside Vite.
 *
 * A feature listed here is off for every account until a row in
 * `user_features` turns it on — see docs/features-and-admin.md. The admin
 * page renders its list from this object, so adding an entry is all it takes
 * for the feature to become grantable.
 */
export const FEATURES = {
	guides: {
		name: 'Guides',
		description: 'Edge guides: a counter that reveals instructions as it climbs.'
	},
	permanentMedia: {
		name: 'Permanent media',
		description: 'Send photos and videos in messages that never self-destruct.'
	}
} as const satisfies Record<string, { name: string; description: string }>;

export type FeatureKey = keyof typeof FEATURES;

// `Object.keys` is typed `string[]`; the registry is the only source of keys,
// so the cast cannot drift from it.
export const FEATURE_KEYS = Object.keys(FEATURES) as [FeatureKey, ...FeatureKey[]];

/**
 * How an account came to hold a feature.
 *
 * `purchase` is reserved for when features can be bought and nothing writes it
 * yet. It exists now so that the column's type does not have to widen, and
 * every reader already has to handle it, when purchases arrive.
 */
export type FeatureSource = 'grant' | 'purchase';

/**
 * Narrows a stored value to a key the code still knows about.
 *
 * A feature removed from `FEATURES` can leave rows behind; reading those as
 * `FeatureKey` would put a key in page data that no lookup can resolve.
 */
export function isFeatureKey(value: string): value is FeatureKey {
	return Object.hasOwn(FEATURES, value);
}

export function hasFeature(features: readonly FeatureKey[], feature: FeatureKey): boolean {
	return features.includes(feature);
}
