import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveGlobalIndexSetBased } from '../abstract/OIMReactiveGlobalIndexSetBased';
import { OIMGlobalIndexManualSetBased } from './OIMGlobalIndexManualSetBased';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { IOIMSingleUpdateEmitter } from '../interfaces/IOIMSingleUpdateEmitter';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

class OIMGlobalIndexManualSetBasedReactive<
    TPk extends TOIMKey,
> extends OIMGlobalIndexManualSetBased<TPk> {
    constructor(
        private readonly updateEmitter: IOIMSingleUpdateEmitter,
        opts?: { comparePks?: TOIMIndexComparator<TPk> }
    ) {
        super(opts);
    }

    protected override emitUpdate(): void {
        this.updateEmitter.markUpdated();
    }
}

/**
 * Reactive manual set-based keyless index — raw-slot writes bridged to a
 * single-carrier emitter. Mirrors {@link OIMReactiveIndexManualSetBased}.
 */
export class OIMReactiveGlobalIndexManualSetBased<
    TPk extends TOIMKey,
> extends OIMReactiveGlobalIndexSetBased<
    TPk,
    OIMGlobalIndexManualSetBased<TPk>
> {
    constructor(
        queue: OIMEventQueue,
        opts?: { indexOptions?: { comparePks?: TOIMIndexComparator<TPk> } }
    ) {
        super(
            queue,
            updateEmitter =>
                new OIMGlobalIndexManualSetBasedReactive<TPk>(
                    updateEmitter,
                    opts?.indexOptions
                )
        );
    }

    public setSlots(slots: Iterable<TOIMAnyEntitySlot<TPk>>): void {
        this.index.setSlots(slots);
    }

    public addSlots(slots: readonly TOIMAnyEntitySlot<TPk>[]): void {
        this.index.addSlots(slots);
    }

    public removeSlots(slots: readonly TOIMAnyEntitySlot<TPk>[]): void {
        this.index.removeSlots(slots);
    }

    public clear(): void {
        this.index.clear();
    }
}
