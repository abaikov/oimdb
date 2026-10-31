import type { OIMEntitySlot } from '../../src/entity/OIMEntitySlot';
import type { TOIMEntityContentSlot } from '../../src/entity/types/TOIMEntityContentSlot';

export const entitySlotOf = <TEntity extends object>(entitySlot: TOIMEntityContentSlot<TEntity>): OIMEntitySlot<TEntity, NonNullable<unknown>> =>
    entitySlot as unknown as OIMEntitySlot<TEntity, NonNullable<unknown>>;
