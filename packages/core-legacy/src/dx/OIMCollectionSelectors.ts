import type { TOIMKey } from '../types/TOIMKey';
import type { OIMReactiveIndexArrayBased } from '../abstract/OIMReactiveIndexArrayBased';
import type { OIMReactiveIndexSetBased } from '../abstract/OIMReactiveIndexSetBased';
import type { OIMIndexArrayBased } from '../abstract/OIMIndexArrayBased';
import type { OIMIndexSetBased } from '../abstract/OIMIndexSetBased';
import type { OIMReactiveGlobalIndexArrayBased } from '../abstract/OIMReactiveGlobalIndexArrayBased';
import type { OIMReactiveGlobalIndexSetBased } from '../abstract/OIMReactiveGlobalIndexSetBased';
import type { OIMGlobalIndexArrayBased } from '../abstract/OIMGlobalIndexArrayBased';
import type { OIMGlobalIndexSetBased } from '../abstract/OIMGlobalIndexSetBased';
import type { OIMEventQueue } from '../core/OIMEventQueue';
import type { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import type { OIMComputeRuntime } from '../modules/compute/core/OIMComputeRuntime';
import { getOIMComputeRuntime } from './getOIMComputeRuntime';
import { OIMCollectionByPkSelector } from '../modules/selector/core/OIMCollectionByPkSelector';
import { OIMCollectionByPksSelector } from '../modules/selector/core/OIMCollectionByPksSelector';
import { OIMEntitiesByIndexKeyArrayBasedSelector } from '../modules/selector/core/OIMEntitiesByIndexKeyArrayBasedSelector';
import { OIMEntitiesByIndexKeySetBasedSelector } from '../modules/selector/core/OIMEntitiesByIndexKeySetBasedSelector';
import { OIMEntitiesByGlobalIndexArrayBasedSelector } from '../modules/selector/core/OIMEntitiesByGlobalIndexArrayBasedSelector';
import { OIMEntitiesByGlobalIndexSetBasedSelector } from '../modules/selector/core/OIMEntitiesByGlobalIndexSetBasedSelector';
import type {
    TOIMCollectionEntitiesSelector,
    TOIMCollectionEntitySelector,
} from '../types/TOIMCollectionSelectors';
import type { TOIMKeyPath } from '../types/TOIMKeyPath';

export class OIMCollectionSelectors<
    TEntity extends object,
    TPk extends TOIMKey,
> {
    public readonly runtime: OIMComputeRuntime;

    constructor(
        queue: OIMEventQueue,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>
    ) {
        // Shared per queue: selectors, computeds and effects on the same queue
        // form ONE dependency graph.
        this.runtime = getOIMComputeRuntime(queue);
    }

    public byPk(pk: TPk): TOIMCollectionEntitySelector<TEntity> {
        return new OIMCollectionByPkSelector(this.runtime, this.collection, pk);
    }

    public byPks(
        pks: readonly TPk[]
    ): TOIMCollectionEntitiesSelector<TEntity> {
        return new OIMCollectionByPksSelector(
            this.runtime,
            this.collection,
            pks
        );
    }

    public entitiesBySetIndexKey<
        TKey extends TOIMKey,
        TIndex extends OIMIndexSetBased<TKey, TPk>,
    >(
        index: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
        key: TKey
    ): TOIMCollectionEntitiesSelector<TEntity> {
        return new OIMEntitiesByIndexKeySetBasedSelector(
            this.runtime,
            this.collection,
            index,
            key
        );
    }

    public entitiesByArrayIndexKey<
        TKey extends TOIMKey,
        TIndex extends OIMIndexArrayBased<TKey, TPk>,
    >(
        index: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
        key: TKey
    ): TOIMCollectionEntitiesSelector<TEntity> {
        return new OIMEntitiesByIndexKeyArrayBasedSelector(
            this.runtime,
            this.collection,
            index,
            key
        );
    }

    /**
     * Entities of a composite (key-path) set-based index for one key path, e.g.
     * `entitiesByCompositeSetIndexKey(index, [projectId, role])`.
     */
    public entitiesByCompositeSetIndexKey<
        TIndex extends OIMIndexSetBased<TOIMKeyPath, TPk>,
    >(
        index: OIMReactiveIndexSetBased<TOIMKeyPath, TPk, TIndex>,
        key: TOIMKeyPath
    ): TOIMCollectionEntitiesSelector<TEntity> {
        return new OIMEntitiesByIndexKeySetBasedSelector(
            this.runtime,
            this.collection,
            index,
            key
        );
    }

    /** Entities of a composite (key-path) array-based index for one key path. */
    public entitiesByCompositeArrayIndexKey<
        TIndex extends OIMIndexArrayBased<TOIMKeyPath, TPk>,
    >(
        index: OIMReactiveIndexArrayBased<TOIMKeyPath, TPk, TIndex>,
        key: TOIMKeyPath
    ): TOIMCollectionEntitiesSelector<TEntity> {
        return new OIMEntitiesByIndexKeyArrayBasedSelector(
            this.runtime,
            this.collection,
            index,
            key
        );
    }

    /** Entities of a keyless (whole-collection) array-based index, ordered. */
    public entitiesByArrayGlobalIndex<
        TIndex extends OIMGlobalIndexArrayBased<TPk>,
    >(
        index: OIMReactiveGlobalIndexArrayBased<TPk, TIndex>
    ): TOIMCollectionEntitiesSelector<TEntity> {
        return new OIMEntitiesByGlobalIndexArrayBasedSelector(
            this.runtime,
            this.collection,
            index
        );
    }

    /** Entities of a keyless (whole-collection) set-based index. */
    public entitiesBySetGlobalIndex<
        TIndex extends OIMGlobalIndexSetBased<TPk>,
    >(
        index: OIMReactiveGlobalIndexSetBased<TPk, TIndex>
    ): TOIMCollectionEntitiesSelector<TEntity> {
        return new OIMEntitiesByGlobalIndexSetBasedSelector(
            this.runtime,
            this.collection,
            index
        );
    }
}
