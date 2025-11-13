import { TOIMPk } from '../types/TOIMPk';

export abstract class OIMIndexStoreSetBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    abstract setOneByKey(key: TKey, pks: Set<TPk>): void;

    abstract removeOneByKey(key: TKey): void;

    abstract removeManyByKeys(keys: readonly TKey[]): void;

    abstract getOneByKey(key: TKey): Set<TPk> | undefined;

    abstract getManyByKeys(keys: readonly TKey[]): Map<TKey, Set<TPk>>;

    abstract getAllKeys(): TKey[];

    abstract getAll(): Map<TKey, Set<TPk>>;

    abstract countAll(): number;

    abstract clear(): void;
}

