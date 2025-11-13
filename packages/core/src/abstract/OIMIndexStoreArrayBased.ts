import { TOIMPk } from '../types/TOIMPk';

export abstract class OIMIndexStoreArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    abstract setOneByKey(key: TKey, pks: TPk[]): void;

    abstract removeOneByKey(key: TKey): void;

    abstract removeManyByKeys(keys: readonly TKey[]): void;

    abstract getOneByKey(key: TKey): TPk[] | undefined;

    abstract getManyByKeys(keys: readonly TKey[]): Map<TKey, TPk[]>;

    abstract getAllKeys(): TKey[];

    abstract getAll(): Map<TKey, TPk[]>;

    abstract countAll(): number;

    abstract clear(): void;
}

