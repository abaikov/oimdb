import type { TOIMKey } from '../../../types/TOIMKey';
import type { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import type { OIMReactiveGlobalIndexArrayBased } from '../../../abstract/OIMReactiveGlobalIndexArrayBased';
import type { OIMGlobalIndexArrayBased } from '../../../abstract/OIMGlobalIndexArrayBased';
import { OIMSelectorSourceDependencyEntitiesByPks } from './OIMSelectorSourceDependencyEntitiesByPks';

/** Entities of an array-based (ordered) keyless (whole-collection) index. */
export class OIMSelectorSourceDependencyEntitiesByGlobalIndexArrayBased<
    TEntity extends object,
    TPk extends TOIMKey,
    TIndex extends OIMGlobalIndexArrayBased<TPk>,
> extends OIMSelectorSourceDependencyEntitiesByPks<TEntity, TPk> {
    constructor(
        collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveGlobalIndexArrayBased<
            TPk,
            TIndex
        >
    ) {
        super(collection);
    }

    protected readPks(): readonly TPk[] {
        return this.reactiveIndex.getPks();
    }

    protected subscribeToIndex(onUpdate: () => void): () => void {
        return this.reactiveIndex.emitter.subscribe(onUpdate);
    }
}
