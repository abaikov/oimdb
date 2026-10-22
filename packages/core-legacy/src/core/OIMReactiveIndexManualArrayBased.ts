import type { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveIndexArrayBased } from '../abstract/OIMReactiveIndexArrayBased';
import { OIMIndexManualArrayBased } from './OIMIndexManualArrayBased';
import type { OIMEventQueue } from './OIMEventQueue';
import type { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import type { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { OIMIndexStoreMapDrivenArrayBased } from './OIMIndexStoreMapDrivenArrayBased';
import { OIMBucketCarrierProvider } from './OIMBucketCarrierProvider';
import type { OIMKeyedBucketArrayBased } from './OIMKeyedBucketArrayBased';
import type { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import type { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

class OIMIndexManualArrayBasedReactive<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMIndexManualArrayBased<TKey, TPk> {
    constructor(
        private readonly emitter: IOIMKeyedUpdateEmitter<TKey>,
        opts?: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreArrayBased<TKey, TPk>;
        }
    ) {
        super(opts);
    }

    // Deliver straight off the bucket the write just touched — O(1).
    protected override emitBucketChanged(
        bucket: OIMKeyedBucketArrayBased<TKey, TPk>
    ): void {
        this.emitter.markUpdatedCarrier(bucket);
    }

    protected override emitUpdate(keys: TKey[]): void {
        this.emitter.markUpdatedKeys(keys);
    }

    protected override emitUpdateOne(key: TKey): void {
        this.emitter.markUpdatedKey(key);
    }
}

export class OIMReactiveIndexManualArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMReactiveIndexArrayBased<
    TKey,
    TPk,
    OIMIndexManualArrayBased<TKey, TPk>
> {
    constructor(
        queue: OIMEventQueue,
        opts?: {
            indexOptions?: {
                comparePks?: TOIMIndexComparator<TPk>;
                store?: OIMIndexStoreArrayBased<TKey, TPk>;
            };
        }
    ) {
        // Share ONE store between the keyed emitter's provider (carriers =
        // buckets) and the index, so a write marks the bucket directly.
        const store =
            opts?.indexOptions?.store ??
            new OIMIndexStoreMapDrivenArrayBased<TKey, TPk>();
        super(
            queue,
            emitter =>
                new OIMIndexManualArrayBasedReactive<TKey, TPk>(emitter, {
                    comparePks: opts?.indexOptions?.comparePks,
                    store,
                }),
            () =>
                new OIMBucketCarrierProvider<
                    TKey,
                    OIMKeyedBucketArrayBased<TKey, TPk>
                >(store)
        );
    }

    public setSlots(key: TKey, slots: TOIMAnyEntitySlot<TPk>[]): void {
        this.index.setSlots(key, slots);
    }

    public appendSlots(
        key: TKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        this.index.appendSlots(key, slots);
    }

    public clear(key?: TKey): void {
        this.index.clear(key);
    }
}
