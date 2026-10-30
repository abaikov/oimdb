import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';
import type { TOIMBucketContentSlot } from './TOIMBucketContentSlot';

export type TOIMBucketSlot<TSlots = unknown, TKey extends NonNullable<unknown> = NonNullable<unknown>> =
    TOIMBucketContentSlot<TSlots> & TOIMIndexableSlot<TKey>;
