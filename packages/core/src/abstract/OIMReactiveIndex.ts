import { OIMIndex } from './OIMIndex';
import { TOIMPk } from '../types/TOIMPk';
import { OIMUpdateEventEmitter } from '../core/OIMUpdateEventEmitter';
import { OIMUpdateEventCoalescerIndex } from '../core/OIMUpdateEventCoalescerIndex';
import { OIMEventQueue } from '../core/OIMEventQueue';

export abstract class OIMReactiveIndex<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TIndex extends OIMIndex<TKey, TPk>,
> {
    public readonly index: TIndex;
    public readonly updateEventEmitter: OIMUpdateEventEmitter<TKey>;
    public readonly coalescer: OIMUpdateEventCoalescerIndex<TKey>;

    constructor(queue: OIMEventQueue, opts?: { index: TIndex }) {
        this.index = opts?.index ?? this.createDefaultIndex();
        this.coalescer = new OIMUpdateEventCoalescerIndex<TKey>(
            this.index.emitter
        );
        this.updateEventEmitter = new OIMUpdateEventEmitter<TKey>({
            coalescer: this.coalescer,
            queue,
        });
    }

    protected abstract createDefaultIndex(): TIndex;

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

    public destroy(): void {
        this.index.destroy();
    }
}
