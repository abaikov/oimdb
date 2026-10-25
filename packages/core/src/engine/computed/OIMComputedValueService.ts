import type { TOIMSameValueGuard } from '../slot/types/TOIMSameValueGuard';
import type { IOIMComputedValueService } from './interfaces/IOIMComputedValueService';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import type { TOIMComputedValueServiceOptions } from './types/TOIMComputedValueServiceOptions';
import type { TOIMComputedStoreSlot } from './types/TOIMComputedStoreSlot';
import { oimRefreshComputedSlot } from './utils/oimRefreshComputedSlot';
import { oimAssertSlotNotReleased } from '../slot/utils/oimAssertSlotNotReleased';

export class OIMComputedValueService<TValue, TComputedSlot extends TOIMComputedContentSlot<TValue> = TOIMComputedContentSlot<TValue>>
implements IOIMComputedValueService<TValue> {
    private readonly derive: ((computedSlot: TComputedSlot) => TValue) | undefined;

    private readonly sameValueGuard: TOIMSameValueGuard<TValue>;

    public constructor(options: TOIMComputedValueServiceOptions<TValue, TComputedSlot>) {
        this.derive = options.derive;
        this.sameValueGuard = options.sameValueGuard ?? Object.is;
    }

    public getValueForSlot(computedSlot: TComputedSlot): TValue {
        oimAssertSlotNotReleased(computedSlot);
        const computedStoreSlot = computedSlot.storeSlot as TOIMComputedStoreSlot<unknown, TValue, TComputedSlot>;
        const derive = computedStoreSlot.derive ?? this.derive;
        oimRefreshComputedSlot(
            computedSlot, derive as (computedSlot: TComputedSlot) => TValue, this.sameValueGuard,
            computedStoreSlot.channelSlot.clock,
        );
        return computedSlot.value;
    }
}
