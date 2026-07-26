import type { TExoBindable, TExoBindableList } from '@exodra/reactivity-types';
import type { TOIMKey } from '@oimdb/core';
import type { TOIMExodraReadable } from './TOIMExodraReadable';

/**
 * A facade with NO key argument anywhere: either a keyless (global) index, or a keyed one already
 * pinned to a key via `.for(keyBindable)`.
 *
 * Every member takes exactly the arguments it needs and nothing else — no function here inspects an
 * argument to work out which call you meant.
 */
export type TOIMExodraPinnedIndexFacade<TEntity, TPk extends TOIMKey> = {
    /** Entities, length-aligned with holes (matching `@oimdb/react`). */
    (): TExoBindable<readonly (TEntity | undefined)[]>;
    /** Just the membership, when a row binds its own entity by pk. */
    pks(): TExoBindable<readonly TPk[]>;
    /** Identity-stable children for the `bindables` bucket. */
    rows<TSchema>(
        render: (entity: TExoBindable<TEntity | undefined>, pk: TPk) => TSchema
    ): TExoBindable<readonly TSchema[]>;
    /** Manual subscription for `onExoMount` scope. Returns unsubscribe. */
    subscribe(onChange: () => void): () => void;
};

/** A keyed index: every member takes the key explicitly. */
export type TOIMExodraKeyedIndexFacade<
    TEntity,
    TPk extends TOIMKey,
    TKey,
> = {
    (key: TKey): TExoBindable<readonly (TEntity | undefined)[]>;
    pks(key: TKey): TExoBindable<readonly TPk[]>;
    rows<TSchema>(
        key: TKey,
        render: (entity: TExoBindable<TEntity | undefined>, pk: TPk) => TSchema
    ): TExoBindable<readonly TSchema[]>;
    subscribe(key: TKey, onChange: () => void): () => void;
    /**
     * Pin this index to a MOVING key. The result takes no key at all and repoints itself whenever
     * the bindable changes — so reactivity lives in exactly one place instead of every key argument
     * accepting two different things.
     */
    for(key: TOIMExodraReadable<TKey>): TOIMExodraPinnedIndexFacade<TEntity, TPk>;
};

/**
 * An ordered (array-based) index additionally offers the O(delta) path: only genuinely moved,
 * inserted or removed rows touch the DOM. It exists ONLY here because a command stream is derived by
 * diffing an order, and a set has none.
 *
 * `list` is absent from the pinned facade on purpose: a `TExoBindableList` is bound once and driven
 * by ops, so following a moving key would mean resetting the entire list on every change — which is
 * what `rows` already does, better.
 */
export type TOIMExodraOrderedIndexFacade<
    TEntity,
    TPk extends TOIMKey,
    TKey extends TOIMKey,
> = TOIMExodraKeyedIndexFacade<TEntity, TPk, TKey> & {
    list<TSchema>(
        key: TKey,
        render: (entity: TExoBindable<TEntity | undefined>, pk: TPk) => TSchema
    ): TExoBindableList<TSchema>;
};

/**
 * Map an index instance to the surface it deserves.
 *
 * Dispatch is STRUCTURAL rather than by class, because the four reactive index bases already differ
 * in exactly the way that matters: an array-based index returns `TPk[]` from `getPksByKey`, a
 * set-based one returns `Set<TPk>`, and the keyless pair has no `getPksByKey` at all. Matching on
 * shape sidesteps the nested generic constraints of the class hierarchy and stays correct for any
 * future index honouring the same contract. Ordered is matched FIRST so `list` is never lost.
 */
export type TOIMExodraIndexFacade<
    TEntity,
    TPk extends TOIMKey,
    TIndex,
> = TIndex extends { getPksByKey(key: infer TKey): TPk[] }
    ? TKey extends TOIMKey
        ? TOIMExodraOrderedIndexFacade<TEntity, TPk, TKey>
        : TOIMExodraKeyedIndexFacade<TEntity, TPk, TKey>
    : TIndex extends { getPksByKey(key: infer TKey): ReadonlySet<TPk> }
      ? TOIMExodraKeyedIndexFacade<TEntity, TPk, TKey>
      : TIndex extends { getPks(): TPk[] | ReadonlySet<TPk> }
        ? TOIMExodraPinnedIndexFacade<TEntity, TPk>
        : never;
