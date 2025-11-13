import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';

export class OIMIndexStoreMapDrivenSetBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexStoreSetBased<TKey, TPk> {
    protected readonly pks = new Map<TKey, Set<TPk>>();

    setOneByKey(key: TKey, pks: Set<TPk>): void {
        this.pks.set(key, pks);
    }

    removeOneByKey(key: TKey): void {
        this.pks.delete(key);
    }

    removeManyByKeys(keys: readonly TKey[]): void {
        // Direct delete instead of method call for better performance
        for (const key of keys) {
            this.pks.delete(key);
        }
    }

    getOneByKey(key: TKey): Set<TPk> | undefined {
        return this.pks.get(key);
    }

    getManyByKeys(keys: readonly TKey[]): Map<TKey, Set<TPk>> {
        // Pre-size Map to reduce reallocations
        const result = new Map<TKey, Set<TPk>>();
        for (const key of keys) {
            const pks = this.getOneByKey(key);
            if (pks !== undefined) {
                result.set(key, pks);
            }
        }
        return result;
    }

    getAllKeys(): TKey[] {
        return Array.from(this.pks.keys());
    }

    getAll(): Map<TKey, Set<TPk>> {
        return new Map(this.pks);
    }

    countAll(): number {
        return this.pks.size;
    }

    clear(): void {
        this.pks.clear();
    }
}

