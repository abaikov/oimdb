import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMGlobalIndexSetBased } from '../abstract/OIMGlobalIndexSetBased';

/**
 * Manual set-based keyless index — direct raw-slot control of the single
 * unordered bucket. Mirrors {@link OIMIndexManualSetBased} minus the key.
 */
export class OIMGlobalIndexManualSetBased<
    TPk extends TOIMPk,
> extends OIMGlobalIndexSetBased<TPk> {
    constructor(options: { comparePks?: TOIMIndexComparator<TPk> } = {}) {
        super(options);
    }

    public setSlots(slots: Iterable<TOIMAnyEntitySlot<TPk>>): void {
        if (this.setSlotsWithComparison(new Set(slots))) this.emitUpdate();
    }

    /** Adds slots IN PLACE (O(added)) and emits once if anything changed. */
    public addSlots(slots: readonly TOIMAnyEntitySlot<TPk>[]): void {
        if (slots.length === 0) return;
        let changed = false;
        for (let i = 0; i < slots.length; i++) {
            if (!this.slots.has(slots[i])) {
                this.slots.add(slots[i]);
                changed = true;
            }
        }
        if (changed) this.emitUpdate();
    }

    /** Removes slots IN PLACE (O(removed)) and emits once if anything changed. */
    public removeSlots(slots: readonly TOIMAnyEntitySlot<TPk>[]): void {
        if (slots.length === 0) return;
        let changed = false;
        for (let i = 0; i < slots.length; i++) {
            if (this.slots.delete(slots[i])) changed = true;
        }
        if (changed) this.emitUpdate();
    }

    public clear(): void {
        if (this.slots.size > 0) {
            this.slots.clear();
            this.emitUpdate();
        }
    }
}
