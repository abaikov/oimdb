import { OIMCollectionIndexManualOrderedArrayBased } from './OIMCollectionIndexManualOrderedArrayBased';
import { OIMCollectionOrderedListCommandStream } from '../modules/wrapper/index/OIMCollectionOrderedListCommandStream';
import {
    TOIMDerivedIndexKeySelector,
    TOIMRelationsArrayIndexOptions,
    TOIMRelationsDerivedArrayIndexOptions,
    TOIMRelationsDerivedSetIndexOptions,
    TOIMRelationsOrderedListOptions,
    TOIMRelationsSetIndexOptions,
} from '../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMReactiveCollectionIndexManualArrayBased } from './OIMReactiveCollectionIndexManualArrayBased';
import { OIMReactiveCollectionIndexManualSetBased } from './OIMReactiveCollectionIndexManualSetBased';
import { OIMReactiveCollection } from './OIMReactiveCollection';
import { OIMDerivedCollectionIndexSetBased } from './OIMDerivedCollectionIndexSetBased';
import { OIMDerivedCollectionIndexArrayBased } from './OIMDerivedCollectionIndexArrayBased';
import { OIMReactiveCollectionGlobalIndexManualArrayBased } from './OIMReactiveCollectionGlobalIndexManualArrayBased';
import { OIMReactiveCollectionGlobalIndexManualSetBased } from './OIMReactiveCollectionGlobalIndexManualSetBased';
import { OIMDerivedCollectionGlobalIndexArrayBased } from './OIMDerivedCollectionGlobalIndexArrayBased';
import { OIMDerivedCollectionGlobalIndexSetBased } from './OIMDerivedCollectionGlobalIndexSetBased';
import {
    TOIMRelationsGlobalArrayIndexOptions,
    TOIMRelationsGlobalSetIndexOptions,
    TOIMRelationsDerivedGlobalArrayIndexOptions,
    TOIMRelationsDerivedGlobalSetIndexOptions,
} from '../types/TOIMCollectionGlobalIndexOptions';

/**
 * Factory helper for collection-bound indexes.
 *
 * It does not store indexes inside the collection. It only keeps the common
 * `queue + collection` binding in one place, so related structures can be
 * created next to the collection with less generic noise.
 */
export class OIMCollectionIndexFactory<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    constructor(
        public readonly queue: OIMEventQueue,
        public readonly collection: OIMReactiveCollection<TEntity, TPk>
    ) {}

    public setBasedIndex<TKey extends TOIMPk = string>(
        opts: TOIMRelationsSetIndexOptions<TKey, TPk> = {}
    ): OIMReactiveCollectionIndexManualSetBased<TKey, TPk, TEntity> {
        return new OIMReactiveCollectionIndexManualSetBased<
            TKey,
            TPk,
            TEntity
        >(this.queue, {
            collection: this.collection,
            indexOptions: opts.indexOptions,
        });
    }

    public derivedSetIndex<TKey extends TOIMPk = string>(
        selectIndexKeys: TOIMDerivedIndexKeySelector<TEntity, TKey>,
        opts: TOIMRelationsDerivedSetIndexOptions<
            TEntity,
            TKey,
            TPk
        > = {}
    ): OIMDerivedCollectionIndexSetBased<TKey, TPk, TEntity> {
        return new OIMDerivedCollectionIndexSetBased<TKey, TPk, TEntity>(
            this.queue,
            this.collection,
            {
                selectIndexKeys,
                buildInitial: opts.buildInitial,
                indexOptions: opts.indexOptions,
            }
        );
    }

    public arrayBasedIndex<TKey extends TOIMPk = string>(
        opts: TOIMRelationsArrayIndexOptions<TKey, TPk> = {}
    ): OIMReactiveCollectionIndexManualArrayBased<TKey, TPk, TEntity> {
        return new OIMReactiveCollectionIndexManualArrayBased<
            TKey,
            TPk,
            TEntity
        >(this.queue, {
            collection: this.collection,
            indexOptions: opts.indexOptions,
        });
    }

    public derivedArrayIndex<TKey extends TOIMPk = string>(
        selectIndexKeys: TOIMDerivedIndexKeySelector<TEntity, TKey>,
        opts: TOIMRelationsDerivedArrayIndexOptions<
            TEntity,
            TKey,
            TPk
        > = {}
    ): OIMDerivedCollectionIndexArrayBased<TKey, TPk, TEntity> {
        return new OIMDerivedCollectionIndexArrayBased<TKey, TPk, TEntity>(
            this.queue,
            this.collection,
            {
                selectIndexKeys,
                buildInitial: opts.buildInitial,
                compareEntities: opts.compareEntities,
                orderBy: opts.orderBy,
                indexOptions: opts.indexOptions,
            }
        );
    }

    /**
     * Keyless (whole-collection / "all") manual array-based index. No key —
     * write pks directly with `setPks`/`addPks`/`removePks`.
     */
    public arrayBasedGlobalIndex(
        opts: TOIMRelationsGlobalArrayIndexOptions<TPk> = {}
    ): OIMReactiveCollectionGlobalIndexManualArrayBased<TPk, TEntity> {
        return new OIMReactiveCollectionGlobalIndexManualArrayBased<
            TPk,
            TEntity
        >(this.queue, {
            collection: this.collection,
            indexOptions: opts.indexOptions,
        });
    }

    /** Keyless (whole-collection) manual set-based index. */
    public setBasedGlobalIndex(
        opts: TOIMRelationsGlobalSetIndexOptions<TPk> = {}
    ): OIMReactiveCollectionGlobalIndexManualSetBased<TPk, TEntity> {
        return new OIMReactiveCollectionGlobalIndexManualSetBased<
            TPk,
            TEntity
        >(this.queue, {
            collection: this.collection,
            indexOptions: opts.indexOptions,
        });
    }

    /**
     * Keyless ordered list auto-derived from the whole collection. Pass
     * `orderBy`/`compareEntities` for order, `filter` to include a subset.
     */
    public derivedArrayGlobalIndex(
        opts: TOIMRelationsDerivedGlobalArrayIndexOptions<TEntity, TPk> = {}
    ): OIMDerivedCollectionGlobalIndexArrayBased<TPk, TEntity> {
        return new OIMDerivedCollectionGlobalIndexArrayBased<TPk, TEntity>(
            this.queue,
            this.collection,
            {
                buildInitial: opts.buildInitial,
                compareEntities: opts.compareEntities,
                orderBy: opts.orderBy,
                filter: opts.filter,
                indexOptions: opts.indexOptions,
            }
        );
    }

    /** Keyless set auto-derived from the whole collection. */
    public derivedSetGlobalIndex(
        opts: TOIMRelationsDerivedGlobalSetIndexOptions<TEntity, TPk> = {}
    ): OIMDerivedCollectionGlobalIndexSetBased<TPk, TEntity> {
        return new OIMDerivedCollectionGlobalIndexSetBased<TPk, TEntity>(
            this.queue,
            this.collection,
            {
                buildInitial: opts.buildInitial,
                filter: opts.filter,
                indexOptions: opts.indexOptions,
            }
        );
    }

    public orderedIndex<TKey extends TOIMPk = string>(): OIMCollectionIndexManualOrderedArrayBased<
        TKey,
        TPk,
        TEntity
    > {
        return new OIMCollectionIndexManualOrderedArrayBased<
            TKey,
            TPk,
            TEntity
        >({
            collection: this.collection,
        });
    }

    public orderedList<TKey extends TOIMPk = string>(
        opts: TOIMRelationsOrderedListOptions<TKey, TPk, TEntity> = {}
    ): OIMCollectionOrderedListCommandStream<TKey, TPk, TEntity> {
        return new OIMCollectionOrderedListCommandStream<TKey, TPk, TEntity>(
            this.queue,
            opts.index
                ? { collection: this.collection, index: opts.index }
                : { collection: this.collection }
        );
    }
}

export function createOIMCollectionIndexFactory<
    TEntity extends object,
    TPk extends TOIMPk,
>(
    queue: OIMEventQueue,
    collection: OIMReactiveCollection<TEntity, TPk>
): OIMCollectionIndexFactory<TEntity, TPk> {
    return new OIMCollectionIndexFactory(queue, collection);
}
