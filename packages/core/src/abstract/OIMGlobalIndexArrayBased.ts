import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMGlobalIndex } from './OIMGlobalIndex';

/**
 * Array-based (ordered) keyless index. Holds a single `slot[]` bucket over the
 * whole collection. Mirrors {@link OIMIndexArrayBased} minus the key.
 */
export abstract class OIMGlobalIndexArrayBased<
    TPk extends TOIMPk,
> extends OIMGlobalIndex<TPk> {
    protected slots: TOIMAnyEntitySlot<TPk>[] = [];

    constructor(options: { comparePks?: TOIMIndexComparator<TPk> } = {}) {
        super(options.comparePks);
    }

    public get size(): number {
        return this.slots.length;
    }

    protected iterateSlots(): Iterable<TOIMAnyEntitySlot<TPk>> {
        return this.slots;
    }

    protected clearBucket(): void {
        this.slots = [];
    }

    public getPks(): TPk[] {
        return this.slotsToPks(this.slots);
    }

    public getSlots(): readonly TOIMAnyEntitySlot<TPk>[] {
        return this.slots;
    }

    protected slotsToPks(slots: readonly TOIMAnyEntitySlot<TPk>[]): TPk[] {
        const pks: TPk[] = [];
        pks.length = slots.length;
        for (let i = 0; i < slots.length; i++) pks[i] = slots[i].pk;
        return pks;
    }

    protected setSlotsWithComparison(
        newSlots: TOIMAnyEntitySlot<TPk>[]
    ): boolean {
        if (this.comparePks && this.slots.length === newSlots.length) {
            if (
                this.comparePks(
                    this.slotsToPks(this.slots),
                    this.slotsToPks(newSlots)
                )
            ) {
                return false;
            }
        }
        this.slots = newSlots;
        return true;
    }
}
