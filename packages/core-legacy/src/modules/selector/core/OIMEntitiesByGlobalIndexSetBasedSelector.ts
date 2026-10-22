import type { TOIMKey } from '../../../types/TOIMKey';
import type { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import type { OIMReactiveGlobalIndexSetBased } from '../../../abstract/OIMReactiveGlobalIndexSetBased';
import type { OIMGlobalIndexSetBased } from '../../../abstract/OIMGlobalIndexSetBased';
import { OIMSelectorArrayValued } from './OIMSelectorArrayValued';
import { OIMSelectorSourceDependencyEntitiesByGlobalIndexSetBased } from './OIMSelectorSourceDependencyEntitiesByGlobalIndexSetBased';
import type { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMEntitiesByGlobalIndexSetBasedSelector<
    TEntity extends object,
    TPk extends TOIMKey,
    TIndex extends OIMGlobalIndexSetBased<TPk>,
> extends OIMSelectorArrayValued<TEntity | undefined> {
    constructor(
        runtime: OIMComputeRuntime,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveGlobalIndexSetBased<
            TPk,
            TIndex
        >
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyEntitiesByGlobalIndexSetBased<
                TEntity,
                TPk,
                TIndex
            >(collection, reactiveIndex),
        ]);
    }

    public getValue(): readonly (TEntity | undefined)[] {
        // Slots, not `getPks()` — the bucket is live and uncopied, so the
        // throwaway `Set<TPk>` that `getPks()` builds is pure overhead here.
        const slots = this.reactiveIndex.getSlots();
        const entities: Array<TEntity | undefined> = [];
        entities.length = slots.size;
        let writeIndex = 0;
        for (const slot of slots) {
            entities[writeIndex++] = this.collection.getOneByPk(slot.pk);
        }
        return entities;
    }
}
