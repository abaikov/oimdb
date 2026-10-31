import type { OIMEntitySlot } from '../OIMEntitySlot';

export type TOIMEntityInserter = <TEntity extends object>(
    slot: OIMEntitySlot<TEntity>,
    entity: TEntity,
) => void;
