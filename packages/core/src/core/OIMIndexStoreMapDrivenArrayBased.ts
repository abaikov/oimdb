import { TOIMPk } from '../type/TOIMPk';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { TOIMAnyEntitySlot } from '../type/TOIMEntitySlot';

export class OIMIndexStoreMapDrivenArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexStoreArrayBased<TKey, TPk> {
    protected readonly slots = new Map<TKey, TOIMAnyEntitySlot<TPk>[]>();

    setOneByKey(key: TKey, slots: TOIMAnyEntitySlot<TPk>[]): void {
        this.slots.set(key, slots);
    }

    removeOneByKey(key: TKey): void {
        this.slots.delete(key);
    }

    removeManyByKeys(keys: readonly TKey[]): void {
        // Direct delete instead of method call for better performance
        for (const key of keys) {
            this.slots.delete(key);
        }
    }

    getOneByKey(key: TKey): TOIMAnyEntitySlot<TPk>[] | undefined {
        return this.slots.get(key);
    }

    getManyByKeys(keys: readonly TKey[]): Map<TKey, TOIMAnyEntitySlot<TPk>[]> {
        // Pre-size Map to reduce reallocations
        const result = new Map<TKey, TOIMAnyEntitySlot<TPk>[]>();
        for (const key of keys) {
            const slots = this.getOneByKey(key);
            if (slots !== undefined) {
                result.set(key, slots);
            }
        }
        return result;
    }

    getAllKeys(): TKey[] {
        return Array.from(this.slots.keys());
    }

    getAll(): Map<TKey, TOIMAnyEntitySlot<TPk>[]> {
        return new Map(this.slots);
    }

    countAll(): number {
        return this.slots.size;
    }

    clear(): void {
        this.slots.clear();
    }
}
