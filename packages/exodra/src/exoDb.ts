import type { TOIMCollectionKit, TOIMKey } from '@oimdb/core';
import type { TOIMExodraDbViews } from './types/TOIMExodraDbViews';
import { exoCollection } from './exoCollection';

/**
 * Stand the whole thing up at once: a record of kits in, a record of Exodra-side views out, keys
 * preserved and fully typed.
 *
 * ```ts
 * const db = exoDb({
 *     users: { kit: usersKit, indexes: { byTeam, byTeamOrdered, online } },
 *     teams: { kit: teamsKit, indexes: { byOrg } },
 *     tags:  { kit: tagsKit },              // no indexes → byPk / byPks only
 * });
 *
 * db.users.byTeam(selectedTeam);
 * db.teams.byPk(teamId);
 * ```
 *
 * Entries are objects rather than `[kit, indexes]` pairs on purpose: a tuple only infers as one at
 * the call site, so hoisting the spec into a variable would widen it to an array and collapse every
 * view to `never`. This shape infers the same either way.
 *
 * Pair it with Exodra's own DI so views never import the database directly:
 *
 * ```ts
 * export const dbKey = createContextKey<typeof db>('db');   // from @exodra/reactivity
 * ```
 *
 * The context key is created by the app, not by this package: `createContextKey` lives in the Exodra
 * runtime, which this bridge deliberately does not depend on (it pulls types only).
 */
export function exoDb<TSpec extends Record<string, unknown>>(
    spec: TSpec
): TOIMExodraDbViews<TSpec> {
    const db: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(spec)) {
        const { kit, indexes } = entry as {
            kit: TOIMCollectionKit<object, TOIMKey>;
            indexes?: Record<string, unknown>;
        };
        db[name] = exoCollection(kit, indexes);
    }
    return db as TOIMExodraDbViews<TSpec>;
}
