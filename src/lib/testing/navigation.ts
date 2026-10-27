import { vi } from 'vitest';

/**
 * A stand-in for `$lib/navigation` in component tests:
 * `vi.mock('$lib/navigation', () => import('$lib/testing/navigation'))`.
 *
 * The real one waits on `navigating` from `$app/state`, which a test that
 * mocks `$app/state` with only `page` does not have, and then calls
 * SvelteKit's router, which a bare component render does not have either. Here
 * a refresh resolves at once and refreshes nothing; a test that cares whether
 * one happened imports these spies.
 */
export const invalidate = vi.fn(async (_resource: unknown): Promise<void> => undefined);
export const invalidateAll = vi.fn(async (): Promise<void> => undefined);
export const navigationSettled = vi.fn(async (): Promise<void> => undefined);
