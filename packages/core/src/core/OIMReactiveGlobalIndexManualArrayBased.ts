import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveGlobalIndexArrayBased } from '../abstract/OIMReactiveGlobalIndexArrayBased';
import { OIMGlobalIndexManualArrayBased } from './OIMGlobalIndexManualArrayBased';
import { OIMEventQueue } from './OIMEventQueue';
import { IOIMSingleUpdateEmitter } from '../interfaces/IOIMSingleUpdateEmitter';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

class OIMGlobalIndexManualArrayBasedReactive<
    TPk extends TOIMKey,
> extends OIMGlobalIndexManualArrayBased<TPk> {
    constructor(
        private readonly emitter: IOIMSingleUpdateEmitter,
        opts?: { comparePks?: TOIMIndexComparator<TPk> }
    ) {
        super(opts);
    }

    protected override emitUpdate(): void {
        this.emitter.markUpdated();
    }
}

/**
 * Reactive manual array-based keyless index — raw-slot writes bridged to a
 * single-carrier emitter. Mirrors {@link OIMReactiveIndexManualArrayBased}.
 */
export class OIMReactiveGlobalIndexManualArrayBased<
    TPk extends TOIMKey,
> extends OIMReactiveGlobalIndexArrayBased<
    TPk,
    OIMGlobalIndexManualArrayBased<TPk>
> {
    constructor(
        queue: OIMEventQueue,
        opts?: { indexOptions?: { comparePks?: TOIMIndexComparator<TPk> } }
    ) {
        super(
            queue,
            emitter =>
                new OIMGlobalIndexManualArrayBasedReactive<TPk>(
                    emitter,
                    opts?.indexOptions
                )
        );
    }

    public setSlots(slots: TOIMAnyEntitySlot<TPk>[]): void {
        this.index.setSlots(slots);
    }

    public appendSlots(slots: readonly TOIMAnyEntitySlot<TPk>[]): void {
        this.index.appendSlots(slots);
    }

    public clear(): void {
        this.index.clear();
    }
}
