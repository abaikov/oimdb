import type { TOIMComputedSlot } from './TOIMComputedSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

export type TOIMSortedComputedSlot<TEntity extends object, TKey extends NonNullable<unknown>> =
    TOIMComputedSlot<readonly TOIMEntitySlot<TEntity>[], TKey>;
