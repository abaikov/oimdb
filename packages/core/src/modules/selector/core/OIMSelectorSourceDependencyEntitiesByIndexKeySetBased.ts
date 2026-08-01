import { TOIMKey } from '../../../types/TOIMKey';
import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMReactiveIndexSetBased } from '../../../abstract/OIMReactiveIndexSetBased';
import { OIMIndexSetBased } from '../../../abstract/OIMIndexSetBased';
import { OIMSelectorSourceDependencyEntitiesByPks } from './OIMSelectorSourceDependencyEntitiesByPks';

/** Entities under ONE key of a set-based keyed index. */
export class OIMSelectorSourceDependencyEntitiesByIndexKeySetBased<
    TEntity extends object,
    TPk extends TOIMKey,
    TKey extends TOIMKey,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
> extends OIMSelectorSourceDependencyEntitiesByPks<TEntity, TPk> {
    constructor(
        collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveIndexSetBased<
            TKey,
            TPk,
            TIndex
        >,
        private readonly key: TKey
    ) {
        super(collection);
    }

    protected readPks(): readonly TPk[] {
        // Read SLOTS, not `getPksByKey`. The bucket is a live `Set<slot>` handed
        // back without a copy, and its pks are unique by construction — the
        // collection interns one slot object per pk, and a `Set` cannot hold the
        // same object twice. `getPksByKey` would build a throwaway `Set<TPk>`
        // (one allocation plus a hash per pk) that this method would immediately
        // flatten away, so the dedup it pays for buys nothing here.
        const slots = this.reactiveIndex.getSlotsByKey(this.key);
        const pks: TPk[] = [];
        pks.length = slots.size;
        let writeIndex = 0;
        for (const slot of slots) pks[writeIndex++] = slot.pk;
        return pks;
    }

    protected subscribeToIndex(onUpdate: () => void): () => void {
        return this.reactiveIndex.emitter.subscribeOnKey(this.key, onUpdate);
    }
}
