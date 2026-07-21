import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMGlobalIndexArrayBased } from '../abstract/OIMGlobalIndexArrayBased';

/**
 * Manual array-based keyless index — direct raw-slot control of the single
 * ordered bucket. Mirrors {@link OIMIndexManualArrayBased} minus the key.
 */
export class OIMGlobalIndexManualArrayBased<
    TPk extends TOIMKey,
> extends OIMGlobalIndexArrayBased<TPk> {
    constructor(options: { comparePks?: TOIMIndexComparator<TPk> } = {}) {
        super(options);
    }

    public setSlots(slots: TOIMAnyEntitySlot<TPk>[]): void {
        if (this.setSlotsWithComparison(slots)) this.emitUpdate();
    }

    /**
     * Appends pre-deduplicated slots to the bucket IN PLACE and emits once.
     * O(added). Callers own dedup (used by collection-bound `addPks`).
     */
    public appendSlots(slots: readonly TOIMAnyEntitySlot<TPk>[]): void {
        if (slots.length === 0) return;
        for (let i = 0; i < slots.length; i++) this.slots.push(slots[i]);
        this.emitUpdate();
    }

    public clear(): void {
        if (this.slots.length > 0) {
            this.slots = [];
            this.emitUpdate();
        }
    }
}
