import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export type TOIMComputedSlot<
    TValue = unknown, TKey extends NonNullable<unknown> = NonNullable<unknown>, TSourceTracker extends OIMSourceTracker | undefined = undefined,
> = TOIMComputedContentSlot<TValue, TSourceTracker> & TOIMIndexableSlot<TKey>;
