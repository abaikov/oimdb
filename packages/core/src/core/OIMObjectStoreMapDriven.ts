import { OIMObjectStore } from '../abstract/OIMObjectStore';
import { TOIMPk } from '../types/TOIMPk';

export class OIMObjectStoreMapDriven<
    TKey extends TOIMPk,
    TValue,
> extends OIMObjectStore<TKey, TValue> {
    protected readonly properties = new Map<TKey, TValue>();

    public setProperty(key: TKey, value: TValue): void {
        this.properties.set(key, value);
    }

    public merge(draft: Partial<Record<TKey, TValue>>): void {
        for (const key in draft) {
            if (!Object.prototype.hasOwnProperty.call(draft, key)) continue;
            this.properties.set(
                key as unknown as TKey,
                draft[key as unknown as TKey] as TValue
            );
        }
    }

    public delete(key: TKey): void {
        this.properties.delete(key);
    }

    public get(key: TKey): TValue | undefined {
        return this.properties.get(key);
    }

    public getAll(): Record<TKey, TValue> {
        return Object.fromEntries(this.properties.entries()) as Record<
            TKey,
            TValue
        >;
    }

    public clear(): void {
        this.properties.clear();
    }

    public count(): number {
        return this.properties.size;
    }

    public keys(): TKey[] {
        return Array.from(this.properties.keys());
    }

    public values(): TValue[] {
        return Array.from(this.properties.values());
    }

    public entries(): [TKey, TValue][] {
        return Array.from(this.properties.entries());
    }

    public destroy(): void {
        this.properties.clear();
    }
}

