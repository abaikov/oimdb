import type { TOIMCollectionKit, TOIMKey } from '@oimdb/core';
import type { TOIMExodraCollection } from './TOIMExodraCollection';

/**
 * Resolve an `exoDb` spec to the record of views it produces — each key mapped to exactly what
 * `exoCollection` would return for that entry, so `db.users.byTeam(...)` is typed end to end.
 *
 * Entity and primary key are inferred from the kit in ONE conditional. Extracting them separately
 * would fix the other parameter to its constraint (`TOIMKey`), and a `TOIMCollectionKit<User, string>`
 * does not match `TOIMCollectionKit<User, TOIMKey>` — the inference silently collapses to `never`.
 *
 * The entry is destructured inline rather than through named helpers, so no type that callers cannot
 * import ends up in the published declarations.
 *
 * Entries are OBJECTS (`{ kit, indexes }`), never tuples. A `[kit, indexes]` pair only infers as a
 * tuple at the call site: hoist the same spec into a variable and it widens to an array, the match
 * fails, and every view silently collapses to `never`. Object properties infer identically either
 * way, so the shape that reads slightly longer is the one that cannot break.
 */
export type TOIMExodraDbViews<TSpec> = {
    [TName in keyof TSpec]: TSpec[TName] extends {
        kit: TOIMCollectionKit<infer TEntity, infer TPk>;
    }
        ? TEntity extends object
            ? TPk extends TOIMKey
                ? TOIMExodraCollection<
                      TEntity,
                      TPk,
                      TSpec[TName] extends { indexes: infer TIndexes }
                          ? TIndexes
                          : Record<string, never>
                  >
                : never
            : never
        : never;
};
