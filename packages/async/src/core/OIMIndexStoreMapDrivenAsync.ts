import { TOIMPk } from '@oimdb/core';
import { IOIMIndexStoreAsync } from '../interfaces/IOIMIndexStoreAsync';

/**
 * In-memory async index store implementation.
 * Stores data in memory with async interface for compatibility.
 */
export class OIMIndexStoreMapDrivenAsync<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> implements IOIMIndexStoreAsync<TKey, TPk> {
    protected readonly pks = new Map<TKey, Set<TPk>>();

    async setOneByKey(key: TKey, pks: Set<TPk>): Promise<void> {
        this.pks.set(key, pks);
    }

    async removeOneByKey(key: TKey): Promise<void> {
        this.pks.delete(key);
    }

    async removeManyByKeys(keys: readonly TKey[]): Promise<void> {
        for (const key of keys) {
            await this.removeOneByKey(key);
        }
    }

    async getOneByKey(key: TKey): Promise<Set<TPk> | undefined> {
        return this.pks.get(key);
    }

    async getManyByKeys(keys: readonly TKey[]): Promise<Map<TKey, Set<TPk>>> {
        const result = new Map<TKey, Set<TPk>>();
        for (const key of keys) {
            const pks = await this.getOneByKey(key);
            if (pks !== undefined) {
                result.set(key, pks);
            }
        }
        return result;
    }

    async getAllKeys(): Promise<TKey[]> {
        return Array.from(this.pks.keys());
    }

    async getAll(): Promise<Map<TKey, Set<TPk>>> {
        return new Map(this.pks);
    }

    async countAll(): Promise<number> {
        return this.pks.size;
    }

    async clear(): Promise<void> {
        this.pks.clear();
    }
}

