import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveIndexArrayBased } from '../abstract/OIMReactiveIndexArrayBased';
import { OIMIndexManualArrayBased } from './OIMIndexManualArrayBased';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { OIMIndexStoreMapDrivenArrayBased } from './OIMIndexStoreMapDrivenArrayBased';
import { OIMBucketCarrierResolver } from './OIMBucketCarrierResolver';
import { OIMKeyedBucketArrayBased } from './OIMKeyedBucketArrayBased';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

class OIMIndexManualArrayBasedReactive<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMIndexManualArrayBased<TKey, TPk> {
    constructor(
        private readonly updateEmitter: IOIMKeyedUpdateEmitter<TKey>,
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
        this.updateEmitter.markUpdatedCarrier(bucket);
    }

    protected override emitUpdate(keys: TKey[]): void {
        this.updateEmitter.markUpdatedKeys(keys);
    }

    protected override emitUpdateOne(key: TKey): void {
        this.updateEmitter.markUpdatedKey(key);
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
        // Share ONE store between the keyed emitter's resolver (carriers =
        // buckets) and the index, so a write marks the bucket directly.
        const store =
            opts?.indexOptions?.store ??
            new OIMIndexStoreMapDrivenArrayBased<TKey, TPk>();
        super(
            queue,
            updateEmitter =>
                new OIMIndexManualArrayBasedReactive<TKey, TPk>(updateEmitter, {
                    comparePks: opts?.indexOptions?.comparePks,
                    store,
                }),
            () =>
                new OIMBucketCarrierResolver<
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
