import type { TOIMColumnName } from '../../column/types/TOIMColumnName';
import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';
import type { TOIMEntityContentSlot } from './TOIMEntityContentSlot';

export type TOIMEntitySlot<
    TEntity extends object = object, TKey extends NonNullable<unknown> = NonNullable<unknown>, TColumnName extends TOIMColumnName<TEntity> = TOIMColumnName<TEntity>,
> = TOIMEntityContentSlot<TEntity, TColumnName> & TOIMIndexableSlot<TKey>;
