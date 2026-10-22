export abstract class OIMObjectStore<
    TKey extends string | number | symbol,
    TValue,
> {
    abstract setProperty(key: TKey, value: TValue): void;

    abstract merge(draft: Partial<Record<TKey, TValue>>): void;

    abstract delete(key: TKey): void;

    abstract get(key: TKey): TValue | undefined;

    abstract getAll(): Record<TKey, TValue>;

    abstract clear(): void;

    abstract count(): number;

    abstract keys(): TKey[];

    abstract values(): TValue[];

    abstract entries(): [TKey, TValue][];

    abstract destroy(): void;
}
