import { OIMEventQueue, OIMUpdateEventEmitter, TOIMPk } from '@oimdb/core';
import { OIMIndexManualAsync } from './OIMIndexManualAsync';
import { TOIMIndexOptionsAsync } from '../types/TOIMIndexOptionsAsync';
import { OIMUpdateEventCoalescerIndexAsyncAdapter } from './OIMUpdateEventCoalescerIndexAsyncAdapter';

/**
 * Reactive async manual index with event support.
 * Extends OIMIndexManualAsync with reactive event system.
 */
export class OIMReactiveIndexManualAsync<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    public readonly index: OIMIndexManualAsync<TKey, TPk>;
    public readonly updateEventEmitter: OIMUpdateEventEmitter<TKey>;
    public readonly coalescer: OIMUpdateEventCoalescerIndexAsyncAdapter<TKey>;

    constructor(
        queue: OIMEventQueue,
        opts?: {
            index?: OIMIndexManualAsync<TKey, TPk>;
            indexOptions?: TOIMIndexOptionsAsync<TKey, TPk>;
        }
    ) {
        this.index = opts?.index ?? this.createDefaultIndex(opts?.indexOptions);
        this.coalescer = new OIMUpdateEventCoalescerIndexAsyncAdapter<TKey>(
            this.index.emitter
        );
        this.updateEventEmitter = new OIMUpdateEventEmitter<TKey>({
            coalescer: this.coalescer,
            queue,
        });
    }

    protected createDefaultIndex(
        options?: TOIMIndexOptionsAsync<TKey, TPk>
    ): OIMIndexManualAsync<TKey, TPk> {
        return new OIMIndexManualAsync<TKey, TPk>(options);
    }

    public async getPksByKey(key: TKey): Promise<Set<TPk>> {
        return await this.index.getPksByKey(key);
    }

    public async getPksByKeys(
        keys: readonly TKey[]
    ): Promise<Map<TKey, Set<TPk>>> {
        return await this.index.getPksByKeys(keys);
    }

    public async hasKey(key: TKey): Promise<boolean> {
        return await this.index.hasKey(key);
    }

    public async getKeys(): Promise<readonly TKey[]> {
        return await this.index.getKeys();
    }

    public async getKeySize(key: TKey): Promise<number> {
        return await this.index.getKeySize(key);
    }

    public async getSize(): Promise<number> {
        return await this.index.getSize();
    }

    public async isEmpty(): Promise<boolean> {
        return await this.index.isEmpty();
    }

    public async getMetrics() {
        return await this.index.getMetrics();
    }

    public async destroy(): Promise<void> {
        await this.index.destroy();
    }

    public async setPks(key: TKey, pks: TPk[]): Promise<void> {
        await this.index.setPks(key, pks);
    }

    public async addPks(key: TKey, pks: readonly TPk[]): Promise<void> {
        await this.index.addPks(key, pks);
    }

    public async removePks(key: TKey, pks: readonly TPk[]): Promise<void> {
        await this.index.removePks(key, pks);
    }

    public async clear(key?: TKey): Promise<void> {
        await this.index.clear(key);
    }
}
