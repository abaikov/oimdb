import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveGlobalIndexArrayBased } from '../abstract/OIMReactiveGlobalIndexArrayBased';
import { OIMGlobalIndexManualArrayBased } from './OIMGlobalIndexManualArrayBased';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { IOIMSingleUpdateEmitter } from '../interfaces/IOIMSingleUpdateEmitter';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

class OIMGlobalIndexManualArrayBasedReactive<
    TPk extends TOIMKey,
> extends OIMGlobalIndexManualArrayBased<TPk> {
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
            updateEmitter =>
                new OIMGlobalIndexManualArrayBasedReactive<TPk>(
                    updateEmitter,
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
