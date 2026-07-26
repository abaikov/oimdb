import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMCollectionKit, TOIMKey } from '@oimdb/core';
import type {
    TOIMExodraIndexFacade,
    TOIMExodraKeyArg,
} from './TOIMExodraIndexFacade';

/**
 * The Exodra-side view of one collection: what `exoCollection(kit, indexes)` returns.
 *
 * Fixed members read by primary key; every index you named becomes a member of the same name, typed
 * by what that index can actually do (`TOIMExodraIndexFacade`). `kit` stays reachable so dropping to
 * plain OIMDB — writes, effects, computeds — never means threading a second reference through views.
 */
export type TOIMExodraCollection<
    TEntity extends object,
    TPk extends TOIMKey,
    TIndexes,
> = {
    /** The wrapped kit — writes and the rest of OIMDB stay one hop away. */
    kit: TOIMCollectionKit<TEntity, TPk>;
    /** One entity. The key may be a bindable, so the view follows a moving selection. */
    byPk(pk: TOIMExodraKeyArg<TPk>): TExoBindable<TEntity | undefined>;
    /** Several entities, length-aligned with holes. */
    byPks(
        pks: TOIMExodraKeyArg<readonly TPk[]>
    ): TExoBindable<readonly (TEntity | undefined)[]>;
} & {
    [TName in keyof TIndexes]: TOIMExodraIndexFacade<
        TEntity,
        TPk,
        TIndexes[TName]
    >;
};
