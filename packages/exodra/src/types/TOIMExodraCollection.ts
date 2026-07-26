import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMCollectionKit, TOIMKey } from '@oimdb/core';
import type { TOIMExodraIndexFacade } from './TOIMExodraIndexFacade';

/**
 * The Exodra-side view of one collection: what `exoCollection(kit, indexes)` returns.
 *
 * Fixed members read by primary key; every index you named becomes a member of the same name, typed
 * by what that index can actually do (`TOIMExodraIndexFacade`). `kit` stays reachable so dropping to
 * plain OIMDB — writes, effects, computeds — never means threading a second reference through views.
 *
 * Keys here are plain values only. For a moving primary key, compose the primitive:
 * `exoKeyed(pkBindable, k => kit.select.byPk(k))`; for a moving index key, `<index>.for(keyBindable)`.
 */
export type TOIMExodraCollection<
    TEntity extends object,
    TPk extends TOIMKey,
    TIndexes,
> = {
    /** The wrapped kit — writes and the rest of OIMDB stay one hop away. */
    kit: TOIMCollectionKit<TEntity, TPk>;
    /** One entity by primary key. */
    byPk(pk: TPk): TExoBindable<TEntity | undefined>;
    /** Several entities, length-aligned with holes. */
    byPks(
        pks: readonly TPk[]
    ): TExoBindable<readonly (TEntity | undefined)[]>;
} & {
    [TName in keyof TIndexes]: TOIMExodraIndexFacade<
        TEntity,
        TPk,
        TIndexes[TName]
    >;
};
