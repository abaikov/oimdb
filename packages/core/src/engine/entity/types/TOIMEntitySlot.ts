import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';
import type { TOIMEntityContentSlot } from './TOIMEntityContentSlot';

export type TOIMEntitySlot<TEntity extends object = object, TKey extends NonNullable<unknown> = NonNullable<unknown>> =
    TOIMEntityContentSlot<TEntity> & TOIMIndexableSlot<TKey>;
