import type { TOIMEntityContentSlot } from './TOIMEntityContentSlot';

export type TOIMEntityInserter = <TEntity extends object>(
    slot: TOIMEntityContentSlot<TEntity>,
    entity: TEntity,
) => void;
