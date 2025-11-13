import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';

export class OIMIndexStoreMapDrivenArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexStoreArrayBased<TKey, TPk> {
    protected readonly pks = new Map<TKey, TPk[]>();

    setOneByKey(key: TKey, pks: TPk[]): void {
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

    getOneByKey(key: TKey): TPk[] | undefined {
        return this.pks.get(key);
    }

    getManyByKeys(keys: readonly TKey[]): Map<TKey, TPk[]> {
        // Pre-size Map to reduce reallocations
        const result = new Map<TKey, TPk[]>();
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

    getAll(): Map<TKey, TPk[]> {
        return new Map(this.pks);
    }

    countAll(): number {
        return this.pks.size;
    }

    clear(): void {
        this.pks.clear();
    }
}

