import { TOIMPk } from '../type/TOIMPk';
import { TOIMAnyEntitySlot } from '../type/TOIMEntitySlot';

export abstract class OIMIndexStoreSetBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    abstract setOneByKey(key: TKey, slots: Set<TOIMAnyEntitySlot<TPk>>): void;

    abstract removeOneByKey(key: TKey): void;

    abstract removeManyByKeys(keys: readonly TKey[]): void;

    abstract getOneByKey(
        key: TKey
    ): Set<TOIMAnyEntitySlot<TPk>> | undefined;

    abstract getManyByKeys(
        keys: readonly TKey[]
    ): Map<TKey, Set<TOIMAnyEntitySlot<TPk>>>;

    abstract getAllKeys(): TKey[];

    abstract getAll(): Map<TKey, Set<TOIMAnyEntitySlot<TPk>>>;

    abstract countAll(): number;

    abstract clear(): void;
}
