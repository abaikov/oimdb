import type { TOIMEntitySlot } from './TOIMEntitySlot';

export type TOIMEntityInsertStrategy = <TEntity extends object>(
    slot: TOIMEntitySlot<TEntity>,
    entity: TEntity,
) => void;
