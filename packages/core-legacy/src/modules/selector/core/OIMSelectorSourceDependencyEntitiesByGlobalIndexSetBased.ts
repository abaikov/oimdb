import type { TOIMKey } from '../../../types/TOIMKey';
import type { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import type { OIMReactiveGlobalIndexSetBased } from '../../../abstract/OIMReactiveGlobalIndexSetBased';
import type { OIMGlobalIndexSetBased } from '../../../abstract/OIMGlobalIndexSetBased';
import { OIMSelectorSourceDependencyEntitiesByPks } from './OIMSelectorSourceDependencyEntitiesByPks';

/** Entities of a set-based keyless (whole-collection) index. */
export class OIMSelectorSourceDependencyEntitiesByGlobalIndexSetBased<
    TEntity extends object,
    TPk extends TOIMKey,
    TIndex extends OIMGlobalIndexSetBased<TPk>,
> extends OIMSelectorSourceDependencyEntitiesByPks<TEntity, TPk> {
    constructor(
        collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveGlobalIndexSetBased<
            TPk,
            TIndex
        >
    ) {
        super(collection);
    }

    protected readPks(): readonly TPk[] {
        // Slots, not `getPks()` — see the keyed counterpart: the bucket is live,
        // its pks are already unique, and `getPks()` would allocate a throwaway
        // `Set<TPk>` just to be flattened here.
        const slots = this.reactiveIndex.getSlots();
        const pks: TPk[] = [];
        pks.length = slots.size;
        let writeIndex = 0;
        for (const slot of slots) pks[writeIndex++] = slot.pk;
        return pks;
    }

    protected subscribeToIndex(onUpdate: () => void): () => void {
        return this.reactiveIndex.emitter.subscribe(onUpdate);
    }
}
