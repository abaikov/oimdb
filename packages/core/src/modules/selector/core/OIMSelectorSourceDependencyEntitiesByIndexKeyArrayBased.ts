import { TOIMKey } from '../../../types/TOIMKey';
import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMReactiveIndexArrayBased } from '../../../abstract/OIMReactiveIndexArrayBased';
import { OIMIndexArrayBased } from '../../../abstract/OIMIndexArrayBased';
import { OIMSelectorSourceDependencyEntitiesByPks } from './OIMSelectorSourceDependencyEntitiesByPks';

/** Entities under ONE key of an array-based (ordered) keyed index. */
export class OIMSelectorSourceDependencyEntitiesByIndexKeyArrayBased<
    TEntity extends object,
    TPk extends TOIMKey,
    TKey extends TOIMKey,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
> extends OIMSelectorSourceDependencyEntitiesByPks<TEntity, TPk> {
    constructor(
        collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveIndexArrayBased<
            TKey,
            TPk,
            TIndex
        >,
        private readonly key: TKey
    ) {
        super(collection);
    }

    protected readPks(): readonly TPk[] {
        return this.reactiveIndex.getPksByKey(this.key);
    }

    protected subscribeToIndex(onUpdate: () => void): () => void {
        return this.reactiveIndex.emitter.subscribeOnKey(this.key, onUpdate);
    }
}
