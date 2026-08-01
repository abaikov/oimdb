import { TOIMKey } from '../../../types/TOIMKey';
import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMReactiveIndexSetBased } from '../../../abstract/OIMReactiveIndexSetBased';
import { OIMIndexSetBased } from '../../../abstract/OIMIndexSetBased';
import { OIMSelectorArrayValued } from './OIMSelectorArrayValued';
import { OIMSelectorSourceDependencyEntitiesByIndexKeySetBased } from './OIMSelectorSourceDependencyEntitiesByIndexKeySetBased';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMEntitiesByIndexKeySetBasedSelector<
    TEntity extends object,
    TPk extends TOIMKey,
    TKey extends TOIMKey,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
> extends OIMSelectorArrayValued<TEntity | undefined> {
    constructor(
        runtime: OIMComputeRuntime,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveIndexSetBased<
            TKey,
            TPk,
            TIndex
        >,
        private readonly key: TKey
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyEntitiesByIndexKeySetBased<
                TEntity,
                TPk,
                TKey,
                TIndex
            >(collection, reactiveIndex, key),
        ]);
    }

    public getValue(): readonly (TEntity | undefined)[] {
        // Slots, not `getPksByKey`: the bucket comes back live and uncopied,
        // while `getPksByKey` would allocate a `Set<TPk>` (plus a hash per pk)
        // that this loop only walks once and throws away.
        const slots = this.reactiveIndex.getSlotsByKey(this.key);
        const entities: Array<TEntity | undefined> = [];
        entities.length = slots.size;
        let writeIndex = 0;
        for (const slot of slots) {
            entities[writeIndex++] = this.collection.getOneByPk(slot.pk);
        }
        return entities;
    }
}
