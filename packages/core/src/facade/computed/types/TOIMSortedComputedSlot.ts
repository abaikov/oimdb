import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

export type TOIMSortedComputedSlot<TEntity extends object, TKey> = TOIMComputedSlot<readonly TOIMEntitySlot<TEntity>[], TKey>;
