import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveIndexSetBased } from '../abstract/OIMReactiveIndexSetBased';
import { OIMIndexManualSetBased } from './OIMIndexManualSetBased';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { OIMIndexStoreMapDrivenSetBased } from './OIMIndexStoreMapDrivenSetBased';
import { OIMBucketCarrierResolver } from './OIMBucketCarrierResolver';
import { OIMKeyedBucketSetBased } from './OIMKeyedBucketSetBased';
import { IOIMKeyDomain } from '../interfaces/IOIMKeyDomain';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

class OIMIndexManualSetBasedReactive<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMIndexManualSetBased<TKey, TPk> {
    constructor(
        private readonly updateEmitter: IOIMKeyedUpdateEmitter<TKey>,
        opts?: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreSetBased<TKey, TPk>;
            pkDomain?: IOIMKeyDomain<TPk>;
        }
    ) {
        super(opts);
    }

    // Deliver straight off the bucket the write just touched — O(1), no
    // key→carrier lookup (the whole point of bucket-as-carrier).
    protected override emitBucketChanged(
        bucket: OIMKeyedBucketSetBased<TKey, TPk>
    ): void {
        this.updateEmitter.markUpdatedCarrier(bucket);
    }

    // clear(all) still emits by key set (rare path).
    protected override emitUpdate(keys: TKey[]): void {
        this.updateEmitter.markUpdatedKeys(keys);
    }

    protected override emitUpdateOne(key: TKey): void {
        this.updateEmitter.markUpdatedKey(key);
    }
}

export class OIMReactiveIndexManualSetBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMReactiveIndexSetBased<
    TKey,
    TPk,
    OIMIndexManualSetBased<TKey, TPk>
> {
    constructor(
        queue: OIMEventQueue,
        opts?: {
            indexOptions?: {
                comparePks?: TOIMIndexComparator<TPk>;
                store?: OIMIndexStoreSetBased<TKey, TPk>;
            };
            /**
             * PK key domain for the per-bucket membership — native for primitive
             * PKs, trie for a composite-PK collection. Threaded from the bound
             * collection's `keyDomain`.
             */
            pkDomain?: IOIMKeyDomain<TPk>;
        }
    ) {
        // Create the store up front so the keyed emitter's resolver and the
        // index share ONE store: the resolver resolves carriers = buckets from
        // it, and the index marks those buckets directly on write.
        const store =
            opts?.indexOptions?.store ??
            new OIMIndexStoreMapDrivenSetBased<TKey, TPk>();
        super(
            queue,
            updateEmitter =>
                new OIMIndexManualSetBasedReactive<TKey, TPk>(updateEmitter, {
                    comparePks: opts?.indexOptions?.comparePks,
                    store,
                    pkDomain: opts?.pkDomain,
                }),
            () =>
                new OIMBucketCarrierResolver<
                    TKey,
                    OIMKeyedBucketSetBased<TKey, TPk>
                >(store)
        );
    }

    public setSlots(
        key: TKey,
        slots: Iterable<TOIMAnyEntitySlot<TPk>>
    ): void {
        this.index.setSlots(key, slots);
    }

    public addSlots(
        key: TKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        this.index.addSlots(key, slots);
    }

    public removeSlots(
        key: TKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        this.index.removeSlots(key, slots);
    }

    public clear(key?: TKey): void {
        this.index.clear(key);
    }
}
