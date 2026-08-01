import { TOIMKey } from '../types/TOIMKey';
import { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import {
    OIMCarrierKeyedEmitter,
    IOIMCarrierProvider,
} from '../core/OIMCarrierKeyedEmitter';
import { OIMKeyedCarrierProvider } from '../core/OIMKeyedCarrierProvider';
import { IOIMKeyCarrier } from '../interfaces/IOIMKeyCarrier';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMIndex } from './OIMIndex';

export abstract class OIMReactiveIndex<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TIndex extends OIMIndex<
        TKey,
        TPk,
        Iterable<TOIMAnyEntitySlot<TPk>>,
        TPks,
        TSlots
    >,
    TPks = unknown,
    TSlots = unknown,
> {
    public readonly index: TIndex;
    public readonly emitter: IOIMKeyedUpdateEmitter<TKey>;

    constructor(
        queue: OIMEventQueue,
        createIndex: (emitter: IOIMKeyedUpdateEmitter<TKey>) => TIndex,
        /**
         * How to build the key→carrier carrierProvider backing the keyed emitter.
         * Defaults to the native-`Map` carrierProvider used by every primitive-keyed
         * index (its fast path is unchanged). A composite (trie-backed) index
         * passes a carrierProvider that keys carriers by key path instead. Called once
         * at construction — no per-operation cost.
         */
        createCarrierProvider: () => IOIMCarrierProvider<
            TKey,
            IOIMKeyCarrier<TKey>
        > = () => new OIMKeyedCarrierProvider<TKey>()
    ) {
        // Carrier-based keyed emitter: handlers live on a per-key carrier, so
        // marking dirty is an O(1) flag set and delivery needs no per-key map
        // lookup. The carrierProvider owns the key→carrier map and prunes empties.
        this.emitter = new OIMCarrierKeyedEmitter<
            TKey,
            IOIMKeyCarrier<TKey>
        >(queue, createCarrierProvider());
        this.index = createIndex(this.emitter);
    }

    public getEntitiesByKey<TEntity extends object = object>(
        key: TKey
    ): (TEntity | undefined)[] {
        return this.index.getEntitiesByKey<TEntity>(key);
    }

    public getEntitiesByKeys<TEntity extends object = object>(
        keys: readonly TKey[]
    ): Map<TKey, (TEntity | undefined)[]> {
        return this.index.getEntitiesByKeys<TEntity>(keys);
    }

    /**
     * The four shape-carrying reads. They delegate against `TPks`/`TSlots`
     * rather than against a concrete `Set`/array, so the Set- and Array-based
     * wrappers below need no bodies of their own.
     */
    public getPksByKey(key: TKey): TPks {
        return this.index.getPksByKey(key);
    }

    public getPksByKeys(keys: readonly TKey[]): Map<TKey, TPks> {
        return this.index.getPksByKeys(keys);
    }

    public getSlotsByKey(key: TKey): TSlots {
        return this.index.getSlotsByKey(key);
    }

    public getSlotsByKeys(keys: readonly TKey[]): Map<TKey, TSlots> {
        return this.index.getSlotsByKeys(keys);
    }

    public hasKey(key: TKey): boolean {
        return this.index.hasKey(key);
    }

    public getKeys(): readonly TKey[] {
        return this.index.getKeys();
    }

    public getKeySize(key: TKey): number {
        return this.index.getKeySize(key);
    }

    public get size(): number {
        return this.index.size;
    }

    public get isEmpty(): boolean {
        return this.index.isEmpty;
    }








    public getSubscriptionMetrics() {
        return this.emitter.getMetrics();
    }

    public destroy(): void {
        this.emitter.destroy();
        this.index.destroy();
    }
}
