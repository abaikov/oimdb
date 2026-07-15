import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMGlobalIndex } from './OIMGlobalIndex';

/**
 * Set-based (unordered, deduped) keyless index. Holds a single `Set<slot>`
 * bucket over the whole collection. Mirrors {@link OIMIndexSetBased} minus the
 * key.
 */
export abstract class OIMGlobalIndexSetBased<
    TPk extends TOIMPk,
> extends OIMGlobalIndex<TPk> {
    protected slots = new Set<TOIMAnyEntitySlot<TPk>>();

    constructor(options: { comparePks?: TOIMIndexComparator<TPk> } = {}) {
        super(options.comparePks);
    }

    public get size(): number {
        return this.slots.size;
    }

    protected iterateSlots(): Iterable<TOIMAnyEntitySlot<TPk>> {
        return this.slots;
    }

    protected clearBucket(): void {
        this.slots.clear();
    }

    public getPks(): Set<TPk> {
        return this.slotsToPks(this.slots);
    }

    public getSlots(): ReadonlySet<TOIMAnyEntitySlot<TPk>> {
        return this.slots;
    }

    protected slotsToPks(slots: Iterable<TOIMAnyEntitySlot<TPk>>): Set<TPk> {
        const pks = new Set<TPk>();
        for (const slot of slots) pks.add(slot.pk);
        return pks;
    }

    protected setSlotsWithComparison(
        newSlots: Set<TOIMAnyEntitySlot<TPk>>
    ): boolean {
        if (this.comparePks && this.slots.size === newSlots.size) {
            if (
                this.comparePks(
                    Array.from(this.slotsToPks(this.slots)),
                    Array.from(this.slotsToPks(newSlots))
                )
            ) {
                return false;
            }
        }
        this.slots = newSlots;
        return true;
    }
}
