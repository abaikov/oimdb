import {
    TOIMPk,
    OIMEventEmitter,
    EOIMIndexEventType,
    TOIMIndexUpdatePayload,
    TOIMIndexComparator,
} from '@oimdb/core';
import { IOIMIndexStoreAsync } from '../interfaces/IOIMIndexStoreAsync';
import { TOIMIndexOptionsAsync } from '../types/TOIMIndexOptionsAsync';
import { OIMIndexStoreMapDrivenAsync } from './OIMIndexStoreMapDrivenAsync';

/**
 * Async manual PK index that allows direct manipulation of key-to-primary-keys mappings.
 * Stores data in memory (index state, not cache) and synchronizes writes with async store.
 */
export class OIMPkIndexManualAsync<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    protected readonly comparePks?: TOIMIndexComparator<TPk>;
    protected readonly store: IOIMIndexStoreAsync<TIndexKey, TPk>;
    public readonly emitter = new OIMEventEmitter<{
        [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TIndexKey>;
    }>();

    constructor(options: TOIMIndexOptionsAsync<TIndexKey, TPk> = {}) {
        this.comparePks = options.comparePks;
        this.store =
            options.store ?? new OIMIndexStoreMapDrivenAsync<TIndexKey, TPk>();
    }

    public async getPksByKeys(
        keys: readonly TIndexKey[]
    ): Promise<Map<TIndexKey, Set<TPk>>> {
        return await this.store.getManyByKeys(keys);
    }

    /**
     * @deprecated Use getPksByKey instead.
     */
    public async getPks(key: TIndexKey): Promise<Set<TPk>> {
        return await this.getPksByKey(key);
    }

    public async getPksByKey(key: TIndexKey): Promise<Set<TPk>> {
        const pksSet = await this.store.getOneByKey(key);
        return pksSet ? pksSet : new Set();
    }

    public async hasKey(key: TIndexKey): Promise<boolean> {
        const pksSet = await this.store.getOneByKey(key);
        return pksSet !== undefined;
    }

    public async getKeys(): Promise<readonly TIndexKey[]> {
        return await this.store.getAllKeys();
    }

    public async getKeySize(key: TIndexKey): Promise<number> {
        const pksSet = await this.store.getOneByKey(key);
        return pksSet ? pksSet.size : 0;
    }

    public async getSize(): Promise<number> {
        return await this.store.countAll();
    }

    public async isEmpty(): Promise<boolean> {
        const count = await this.store.countAll();
        return count === 0;
    }

    public async getMetrics() {
        let totalPks = 0;
        let maxBucketSize = 0;
        let minBucketSize = Infinity;
        const allPks = await this.store.getAll();

        for (const pksSet of allPks.values()) {
            totalPks += pksSet.size;
            maxBucketSize = Math.max(maxBucketSize, pksSet.size);
            minBucketSize = Math.min(minBucketSize, pksSet.size);
        }

        return {
            totalKeys: allPks.size,
            totalPks,
            averagePksPerKey: allPks.size > 0 ? totalPks / allPks.size : 0,
            maxBucketSize: maxBucketSize === -Infinity ? 0 : maxBucketSize,
            minBucketSize: minBucketSize === Infinity ? 0 : minBucketSize,
        };
    }

    public async destroy(): Promise<void> {
        this.emitter.offAll();
        await this.store.clear();
    }

    public async setPks(key: TIndexKey, pks: TPk[]): Promise<void> {
        const hasChanges = await this.setPksWithComparison(key, new Set(pks));

        if (hasChanges) {
            await this.store.setOneByKey(key, new Set(pks));
            this.emitUpdate([key]);
        }
    }

    public async addPks(key: TIndexKey, pks: readonly TPk[]): Promise<void> {
        if (pks.length === 0) return;

        let pksSet = await this.store.getOneByKey(key);
        if (!pksSet) {
            pksSet = new Set();
        }

        let hasChanges = false;
        for (const pk of pks) {
            const sizeBefore = pksSet.size;
            pksSet.add(pk);
            if (pksSet.size > sizeBefore) {
                hasChanges = true;
            }
        }

        if (hasChanges) {
            await this.store.setOneByKey(key, pksSet);
            this.emitUpdate([key]);
        }
    }

    public async removePks(
        key: TIndexKey,
        pks: readonly TPk[]
    ): Promise<void> {
        if (pks.length === 0) return;

        const pksSet = await this.store.getOneByKey(key);
        if (!pksSet) return;

        let hasChanges = false;
        for (const pk of pks) {
            if (pksSet.delete(pk)) {
                hasChanges = true;
            }
        }

        if (pksSet.size === 0) {
            await this.store.removeOneByKey(key);
            hasChanges = true;
        } else if (hasChanges) {
            await this.store.setOneByKey(key, pksSet);
        }

        if (hasChanges) {
            this.emitUpdate([key]);
        }
    }

    public async clear(key?: TIndexKey): Promise<void> {
        if (key === undefined) {
            const allKeys = await this.store.getAllKeys();
            if (allKeys.length > 0) {
                await this.store.clear();
                this.emitUpdate(allKeys);
            }
        } else {
            const pksSet = await this.store.getOneByKey(key);
            if (pksSet !== undefined) {
                await this.store.removeOneByKey(key);
                this.emitUpdate([key]);
            }
        }
    }

    protected async setPksWithComparison(
        key: TIndexKey,
        newPks: Set<TPk>
    ): Promise<boolean> {
        const existingPks = await this.getPksByKey(key);

        if (
            this.comparePks &&
            this.comparePks(
                Array.from(existingPks.values()),
                Array.from(newPks.values())
            )
        ) {
            return false;
        }

        return true;
    }

    protected emitUpdate(keys: TIndexKey[]): void {
        this.emitter.emit(EOIMIndexEventType.UPDATE, { keys });
    }
}
