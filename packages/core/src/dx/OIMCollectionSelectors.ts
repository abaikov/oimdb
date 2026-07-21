import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveIndexArrayBased } from '../abstract/OIMReactiveIndexArrayBased';
import { OIMReactiveIndexSetBased } from '../abstract/OIMReactiveIndexSetBased';
import { OIMIndexArrayBased } from '../abstract/OIMIndexArrayBased';
import { OIMIndexSetBased } from '../abstract/OIMIndexSetBased';
import { OIMReactiveGlobalIndexArrayBased } from '../abstract/OIMReactiveGlobalIndexArrayBased';
import { OIMReactiveGlobalIndexSetBased } from '../abstract/OIMReactiveGlobalIndexSetBased';
import { OIMGlobalIndexArrayBased } from '../abstract/OIMGlobalIndexArrayBased';
import { OIMGlobalIndexSetBased } from '../abstract/OIMGlobalIndexSetBased';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import { OIMComputeRuntime } from '../modules/compute/core/OIMComputeRuntime';
import { OIMCollectionByPkSelector } from '../modules/selector/core/OIMCollectionByPkSelector';
import { OIMCollectionByPksSelector } from '../modules/selector/core/OIMCollectionByPksSelector';
import { OIMEntitiesByIndexKeyArrayBasedSelector } from '../modules/selector/core/OIMEntitiesByIndexKeyArrayBasedSelector';
import { OIMEntitiesByIndexKeySetBasedSelector } from '../modules/selector/core/OIMEntitiesByIndexKeySetBasedSelector';
import { OIMEntitiesByGlobalIndexArrayBasedSelector } from '../modules/selector/core/OIMEntitiesByGlobalIndexArrayBasedSelector';
import { OIMEntitiesByGlobalIndexSetBasedSelector } from '../modules/selector/core/OIMEntitiesByGlobalIndexSetBasedSelector';
import {
    TOIMCollectionEntitiesSelector,
    TOIMCollectionEntitySelector,
} from '../types/TOIMCollectionSelectors';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMKeyPath } from '../types/TOIMKeyPath';

export class OIMCollectionSelectors<
    TEntity extends object,
    TPk extends TOIMKey,
> {
    public readonly runtime: OIMComputeRuntime;

    constructor(
        queue: OIMEventQueue,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>
    ) {
        this.runtime = new OIMComputeRuntime(queue);
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
