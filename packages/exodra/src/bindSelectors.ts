import type { TExoBindable } from '@exodra/reactivity-types';
import type {
    OIMCollectionSelectors,
    OIMGlobalIndexArrayBased,
    OIMGlobalIndexSetBased,
    OIMIndexArrayBased,
    OIMIndexSetBased,
    OIMReactiveGlobalIndexArrayBased,
    OIMReactiveGlobalIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMReactiveIndexSetBased,
    TOIMKey,
    TOIMKeyPath,
} from '@oimdb/core';
import type { TOIMExodraBindableOptions } from './types/TOIMExodraBindableOptions';
import type { TOIMExodraReadable } from './types/TOIMExodraReadable';
import { fromSelector } from './fromSelector';
import { fromSelectorFactory } from './fromSelectorFactory';

type TEntityBindable<TEntity> = TExoBindable<TEntity | undefined>;
type TEntitiesBindable<TEntity> = TExoBindable<readonly (TEntity | undefined)[]>;

/**
 * Mirror an `OIMCollectionSelectors` into an object of bindable-returning methods — the `@oimdb/react`
 * hooks, but yielding `TExoBindable` instead of a re-render. Every key argument also accepts a
 * bindable (`TKey | TOIMExodraReadable<TKey>`), so a view follows a moving selection without
 * recreation.
 *
 * The collection's queue is private, hence the entry point is the `OIMCollectionSelectors` instance
 * (which already owns a queue-bound compute runtime) rather than a bare collection.
 */
export function bindSelectors<TEntity extends object, TPk extends TOIMKey>(
    selectors: OIMCollectionSelectors<TEntity, TPk>,
    defaults?: TOIMExodraBindableOptions<unknown>
) {
    const entityOpts = defaults as
        | TOIMExodraBindableOptions<TEntity | undefined>
        | undefined;
    const entitiesOpts = defaults as
        | TOIMExodraBindableOptions<readonly (TEntity | undefined)[]>
        | undefined;

    return {
        byPk(
            pk: TPk | TOIMExodraReadable<TPk>,
            opts = entityOpts
        ): TEntityBindable<TEntity> {
            return fromSelectorFactory(pk, k => selectors.byPk(k), opts);
        },

        byPks(
            pks: readonly TPk[] | TOIMExodraReadable<readonly TPk[]>,
            opts = entitiesOpts
        ): TEntitiesBindable<TEntity> {
            return fromSelectorFactory(pks, k => selectors.byPks(k), opts);
        },

        entitiesBySetIndexKey<
            TKey extends TOIMKey,
            TIndex extends OIMIndexSetBased<TKey, TPk>,
        >(
            index: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
            key: TKey | TOIMExodraReadable<TKey>,
            opts = entitiesOpts
        ): TEntitiesBindable<TEntity> {
            return fromSelectorFactory(
                key,
                k => selectors.entitiesBySetIndexKey(index, k),
                opts
            );
        },

        entitiesByArrayIndexKey<
            TKey extends TOIMKey,
            TIndex extends OIMIndexArrayBased<TKey, TPk>,
        >(
            index: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
            key: TKey | TOIMExodraReadable<TKey>,
            opts = entitiesOpts
        ): TEntitiesBindable<TEntity> {
            return fromSelectorFactory(
                key,
                k => selectors.entitiesByArrayIndexKey(index, k),
                opts
            );
        },

        entitiesByCompositeSetIndexKey<
            TIndex extends OIMIndexSetBased<TOIMKeyPath, TPk>,
        >(
            index: OIMReactiveIndexSetBased<TOIMKeyPath, TPk, TIndex>,
            key: TOIMKeyPath | TOIMExodraReadable<TOIMKeyPath>,
            opts = entitiesOpts
        ): TEntitiesBindable<TEntity> {
            return fromSelectorFactory(
                key,
                k => selectors.entitiesByCompositeSetIndexKey(index, k),
                opts
            );
        },

        entitiesByCompositeArrayIndexKey<
            TIndex extends OIMIndexArrayBased<TOIMKeyPath, TPk>,
        >(
            index: OIMReactiveIndexArrayBased<TOIMKeyPath, TPk, TIndex>,
            key: TOIMKeyPath | TOIMExodraReadable<TOIMKeyPath>,
            opts = entitiesOpts
        ): TEntitiesBindable<TEntity> {
            return fromSelectorFactory(
                key,
                k => selectors.entitiesByCompositeArrayIndexKey(index, k),
                opts
            );
        },

        entitiesByArrayGlobalIndex<TIndex extends OIMGlobalIndexArrayBased<TPk>>(
            index: OIMReactiveGlobalIndexArrayBased<TPk, TIndex>,
            opts = entitiesOpts
        ): TEntitiesBindable<TEntity> {
            return fromSelector(selectors.entitiesByArrayGlobalIndex(index), opts);
        },

        entitiesBySetGlobalIndex<TIndex extends OIMGlobalIndexSetBased<TPk>>(
            index: OIMReactiveGlobalIndexSetBased<TPk, TIndex>,
            opts = entitiesOpts
        ): TEntitiesBindable<TEntity> {
            return fromSelector(selectors.entitiesBySetGlobalIndex(index), opts);
        },
    };
}
