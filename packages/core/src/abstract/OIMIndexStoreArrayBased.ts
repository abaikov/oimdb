import { TOIMPk } from '../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

export abstract class OIMIndexStoreArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    abstract setOneByKey(key: TKey, slots: TOIMAnyEntitySlot<TPk>[]): void;

    abstract removeOneByKey(key: TKey): void;

    abstract removeManyByKeys(keys: readonly TKey[]): void;

    abstract getOneByKey(key: TKey): TOIMAnyEntitySlot<TPk>[] | undefined;

    abstract getManyByKeys(
        keys: readonly TKey[]
    ): Map<TKey, TOIMAnyEntitySlot<TPk>[]>;

    abstract getAllKeys(): TKey[];

    abstract getAll(): Map<TKey, TOIMAnyEntitySlot<TPk>[]>;

    abstract countAll(): number;

    abstract clear(): void;
}
