import { TOIMPk } from '../types/TOIMPk';
import { OIMUpdateEventEmitter } from '../core/OIMUpdateEventEmitter';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { IOIMKeyedSubscription } from '../interfaces/IOIMKeyedSubscription';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMIndex } from './OIMIndex';

export abstract class OIMReactiveIndex<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TIndex extends OIMIndex<TKey, TPk, Iterable<TOIMAnyEntitySlot<TPk>>>,
> implements IOIMKeyedSubscription<TKey> {
    public readonly index: TIndex;
    protected readonly updateEmitter: OIMUpdateEventEmitter<TKey>;

    constructor(
        queue: OIMEventQueue,
        createIndex: (updateEmitter: OIMUpdateEventEmitter<TKey>) => TIndex
    ) {
        this.updateEmitter = new OIMUpdateEventEmitter<TKey>(queue);
        this.index = createIndex(this.updateEmitter);
    }

    public getEntitiesByKey<TEntity extends object = object>(
        key: TKey
    ): TEntity[] {
        return this.index.getEntitiesByKey<TEntity>(key);
    }

    public getEntitiesByKeys<TEntity extends object = object>(
        keys: readonly TKey[]
    ): Map<TKey, TEntity[]> {
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
