import type { TOIMEntityColumnName } from './TOIMEntityColumnName';
import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';
import type { TOIMEntityContentSlot } from './TOIMEntityContentSlot';

export type TOIMEntitySlot<
    TEntity extends object = object, TKey extends NonNullable<unknown> = NonNullable<unknown>, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>,
> = TOIMEntityContentSlot<TEntity, TColumnName> & TOIMIndexableSlot<TKey>;
