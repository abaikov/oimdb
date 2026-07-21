import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import {
    OIMCarrierKeyedEmitter,
    IOIMCarrierResolver,
} from '../core/OIMCarrierKeyedEmitter';
import { OIMKeyedCarrierResolver } from '../core/OIMKeyedCarrierResolver';
import { IOIMKeyCarrier } from '../interfaces/IOIMKeyCarrier';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { IOIMKeyedSubscription } from '../interfaces/IOIMKeyedSubscription';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMIndex } from './OIMIndex';

export abstract class OIMReactiveIndex<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TIndex extends OIMIndex<TKey, TPk, Iterable<TOIMAnyEntitySlot<TPk>>>,
> implements IOIMKeyedSubscription<TKey> {
    public readonly index: TIndex;
    protected readonly updateEmitter: IOIMKeyedUpdateEmitter<TKey>;

    constructor(
        queue: OIMEventQueue,
        createIndex: (updateEmitter: IOIMKeyedUpdateEmitter<TKey>) => TIndex,
        /**
         * How to build the key→carrier resolver backing the keyed emitter.
         * Defaults to the native-`Map` resolver used by every primitive-keyed
         * index (its fast path is unchanged). A composite (trie-backed) index
         * passes a resolver that keys carriers by key path instead. Called once
         * at construction — no per-operation cost.
         */
        createResolver: () => IOIMCarrierResolver<
            TKey,
            IOIMKeyCarrier<TKey>
        > = () => new OIMKeyedCarrierResolver<TKey>()
    ) {
        // Carrier-based keyed emitter: handlers live on a per-key carrier, so
        // marking dirty is an O(1) flag set and delivery needs no per-key map
        // lookup. The resolver owns the key→carrier map and prunes empties.
        this.updateEmitter = new OIMCarrierKeyedEmitter<
            TKey,
            IOIMKeyCarrier<TKey>
        >(queue, createResolver());
        this.index = createIndex(this.updateEmitter);
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

    public getMetrics() {
        return this.index.getMetrics();
    }

    public subscribeOnKey(
        key: TKey,
        handler: TOIMEventHandler<void>
    ): () => void {
        return this.updateEmitter.subscribeOnKey(key, handler);
    }

    public subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void {
        return this.updateEmitter.subscribeOnKeys(keys, handler);
    }

    public unsubscribeFromKey(
        key: TKey,
        handler: TOIMEventHandler<void>
    ): void {
        this.updateEmitter.unsubscribeFromKey(key, handler);
    }

    public unsubscribeFromKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): void {
        this.updateEmitter.unsubscribeFromKeys(keys, handler);
    }

    public hasSubscriptions(): boolean {
        return this.updateEmitter.hasSubscriptions();
    }

    public getHandlerCount(key: TKey): number {
        return this.updateEmitter.getHandlerCount(key);
    }

    public getSubscriptionMetrics() {
        return this.updateEmitter.getMetrics();
    }

    public destroy(): void {
        this.updateEmitter.destroy();
        this.index.destroy();
    }
}
