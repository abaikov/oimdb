import { TOIMPk } from './TOIMPk';

export type TOIMEntitySlot<
    TEntity extends object,
    TPk extends TOIMPk,
> = {
    pk: TPk;
    item: TEntity | undefined;
};

export type TOIMAnyEntitySlot<TPk extends TOIMPk> = TOIMEntitySlot<
    object,
    TPk
>;

export type TOIMEntitySlotResolver<TPk extends TOIMPk> = (
    pk: TPk
) => TOIMAnyEntitySlot<TPk> | undefined;
