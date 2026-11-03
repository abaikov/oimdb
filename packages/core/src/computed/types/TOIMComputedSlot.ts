import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';
import type { TOIMComputedCarrierSlot } from './TOIMComputedCarrierSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export type TOIMComputedSlot<
    TValue = unknown, TKey extends NonNullable<unknown> = NonNullable<unknown>, TSourceTracker extends OIMSourceTracker | undefined = undefined,
> = TOIMComputedCarrierSlot<TValue, TSourceTracker> & TOIMIndexableSlot<TKey>;
