import type { TOIMSameValueGuard } from '../slot/types/TOIMSameValueGuard';
import type { IOIMComputedValueService } from './interfaces/IOIMComputedValueService';
import type { TOIMComputedSlot } from './types/TOIMComputedSlot';
import type { TOIMComputedValueServiceOptions } from './types/TOIMComputedValueServiceOptions';
import type { TOIMComputedStoreSlot } from './types/TOIMComputedStoreSlot';
import { oimRefreshComputedSlot } from './utils/oimRefreshComputedSlot';
import { oimAssertSlotNotReleased } from '../slot/utils/oimAssertSlotNotReleased';

export class OIMComputedValueService<TKey, TValue> implements IOIMComputedValueService<TValue> {
    private readonly derive: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined;

    private readonly sameValueGuard: TOIMSameValueGuard<TValue>;

    public constructor(options: TOIMComputedValueServiceOptions<TKey, TValue>) {
        this.derive = options.derive;
        this.sameValueGuard = options.sameValueGuard ?? Object.is;
    }

    public getValueForSlot(computedSlot: TOIMComputedSlot<TValue, TKey>): TValue {
        oimAssertSlotNotReleased(computedSlot);
        const computedStoreSlot = computedSlot.storeSlot as TOIMComputedStoreSlot<unknown, TValue, TKey>;
        const derive = computedStoreSlot.derive ?? this.derive;
        oimRefreshComputedSlot(
            computedSlot, derive as (computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue, this.sameValueGuard,
            computedStoreSlot.channelSlot.clock,
        );
        return computedSlot.value;
    }
}
