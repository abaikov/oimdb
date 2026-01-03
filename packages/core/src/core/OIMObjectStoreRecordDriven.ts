import { OIMObjectStore } from '../abstract/OIMObjectStore';

/**
 * Record-driven store (plain object) for OIMObject.
 *
 * Note: object keys are strings at runtime, so this store is limited to string keys
 * for type-safety and predictable semantics.
 */
export class OIMObjectStoreRecordDriven<
    TKey extends string,
    TValue,
> extends OIMObjectStore<TKey, TValue> {
    protected properties: Record<TKey, TValue>;

    constructor(initial?: Partial<Record<TKey, TValue>>) {
        super();
        this.properties = Object.assign(Object.create(null), initial ?? {});
    }

    public setProperty(key: TKey, value: TValue): void {
        this.properties[key] = value;
    }

    public merge(draft: Partial<Record<TKey, TValue>>): void {
        Object.assign(this.properties, draft);
    }

    public delete(key: TKey): void {
        delete this.properties[key];
    }

    public get(key: TKey): TValue | undefined {
        return this.properties[key];
    }

    public getAll(): Record<TKey, TValue> {
        return { ...this.properties };
    }

    public clear(): void {
        this.properties = Object.create(null);
    }

    public count(): number {
        return Object.keys(this.properties).length;
    }

    public keys(): TKey[] {
        return Object.keys(this.properties) as TKey[];
    }

    public values(): TValue[] {
        return Object.values(this.properties);
    }

    public entries(): [TKey, TValue][] {
        return Object.entries(this.properties) as [TKey, TValue][];
    }

    public destroy(): void {
        this.clear();
    }
}
