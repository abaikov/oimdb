import type { TExoBindable, TExoBindableList } from '@exodra/reactivity-types';
import type { TOIMKey } from '@oimdb/core';
import type { TOIMExodraReadable } from './TOIMExodraReadable';

/** A key argument: a plain value, or a bindable carrying one (the view follows a moving selection). */
export type TOIMExodraKeyArg<TKey> = TKey | TOIMExodraReadable<TKey>;

/**
 * What an index named in `exoCollection(kit, { … })` becomes. Each one is CALLABLE — `users.byTeam(id)`
 * reads the entities — and carries the other things you can do with that same index, so everything
 * about one index lives under one name.
 */
export type TOIMExodraKeyedIndexFacade<TEntity, TPk extends TOIMKey, TKey> = {
    /** Entities for one key, length-aligned with holes (matching `@oimdb/react`). */
    (key: TOIMExodraKeyArg<TKey>): TExoBindable<
        readonly (TEntity | undefined)[]
    >;
    /** Just the membership, when a row binds its own entity by pk. */
    pks(key: TOIMExodraKeyArg<TKey>): TExoBindable<readonly TPk[]>;
    /** Identity-stable children for the `bindables` bucket: `<ul bindable={{ children: rows }} />`. */
    rows<TSchema>(
        key: TOIMExodraKeyArg<TKey>,
        render: (
            entity: TExoBindable<TEntity | undefined>,
            pk: TPk
        ) => TSchema
    ): TExoBindable<readonly TSchema[]>;
    /** Manual subscription, for `onExoMount`-scoped work outside a bindable. Returns unsubscribe. */
    subscribe(key: TKey, onChange: () => void): () => void;
};

/**
 * An ordered (array-based) index additionally offers the O(delta) path: only the genuinely moved,
 * inserted or removed rows touch the DOM. It exists ONLY here because a command stream is derived
 * from an array-based index — a set has no order to diff.
 */
export type TOIMExodraOrderedIndexFacade<
    TEntity,
    TPk extends TOIMKey,
    TKey extends TOIMKey,
> = TOIMExodraKeyedIndexFacade<TEntity, TPk, TKey> & {
    /** Op-based list for the `bindableLists` bucket: `<ul bindableList={{ children: list }} />`. */
    list<TSchema>(
        key: TKey,
        render: (
            entity: TExoBindable<TEntity | undefined>,
            pk: TPk
        ) => TSchema
    ): TExoBindableList<TSchema>;
};

/** A keyless whole-collection index: same surface, minus the key. */
export type TOIMExodraGlobalIndexFacade<TEntity, TPk extends TOIMKey> = {
    (): TExoBindable<readonly (TEntity | undefined)[]>;
    pks(): TExoBindable<readonly TPk[]>;
    rows<TSchema>(
        render: (
            entity: TExoBindable<TEntity | undefined>,
            pk: TPk
        ) => TSchema
    ): TExoBindable<readonly TSchema[]>;
    subscribe(onChange: () => void): () => void;
};

/**
 * Map an index instance to the surface it deserves.
 *
 * Dispatch is STRUCTURAL rather than by class, because the four reactive index bases already differ
 * in exactly the way that matters: an array-based index returns `TPk[]` from `getPksByKey`, a
 * set-based one returns `Set<TPk>`, and the keyless pair has no `getPksByKey` at all. Matching on
 * shape sidesteps the nested generic constraints of the class hierarchy and stays correct for any
 * future index that honours the same contract. Ordered is matched FIRST so `list` is never lost.
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
        ? TOIMExodraGlobalIndexFacade<TEntity, TPk>
        : never;
