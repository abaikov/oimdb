import { OIMIndexSetBased } from './OIMIndexSetBased';
import { TOIMPk } from '../type/TOIMPk';
import { OIMUpdateEventEmitter } from '../core/OIMUpdateEventEmitter';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { IOIMKeyedSubscription } from '../interfaces/IOIMKeyedSubscription';
import { TOIMEventHandler } from '../type/TOIMEventHandler';

export abstract class OIMReactiveIndexSetBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
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

    public getPksByKey(key: TKey): Set<TPk> {
        return this.index.getPksByKey(key);
    }

    public getPksByKeys(keys: readonly TKey[]): Map<TKey, Set<TPk>> {
        return this.index.getPksByKeys(keys);
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

    public subscribeOnKey(key: TKey, handler: TOIMEventHandler<void>): () => void {
        return this.updateEmitter.subscribeOnKey(key, handler);
    }

    public subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void {
        return this.updateEmitter.subscribeOnKeys(keys, handler);
    }

    public unsubscribeFromKey(key: TKey, handler: TOIMEventHandler<void>): void {
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

