import type { OIMComputedSlot } from './OIMComputedSlot';
import type { TOIMSameValueGuard } from '../slot/types/TOIMSameValueGuard';
import type { IOIMComputedValueService } from './interfaces/IOIMComputedValueService';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import type { TOIMComputedValueServiceOptions } from './types/TOIMComputedValueServiceOptions';
import type { TOIMComputedStoreSlot } from './types/TOIMComputedStoreSlot';
import type { TOIMComputedValueReleaser } from './types/TOIMComputedValueReleaser';
import { oimRefreshComputedSlot } from './utils/oimRefreshComputedSlot';
import { oimAssertSlotNotReleased } from '../slot/utils/oimAssertSlotNotReleased';
import { oimReleaseNoValue } from './utils/oimReleaseNoValue';

import type { OIMSourceTracker } from './OIMSourceTracker';
export class OIMComputedValueService<
    TValue, TComputedSlot extends TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined> = TOIMComputedContentSlot<TValue>,
>
implements IOIMComputedValueService<TValue> {
    private readonly derive: ((computedSlot: TComputedSlot) => TValue) | undefined;

    protected readonly sameValueGuard: TOIMSameValueGuard<TValue>;

    protected readonly releaseValue: TOIMComputedValueReleaser<TValue>;

    public constructor(options: TOIMComputedValueServiceOptions<TValue, TComputedSlot>) {
        this.derive = options.derive;
        this.sameValueGuard = options.sameValueGuard ?? Object.is;
        this.releaseValue = options.releaseValue ?? oimReleaseNoValue;
    }

    public getValueForSlot(computedSlot: TComputedSlot): TValue {
        oimAssertSlotNotReleased(computedSlot);
        const computedStoreSlot = computedSlot.storeSlot as TOIMComputedStoreSlot<unknown, TValue, TComputedSlot>;
        const derive = computedStoreSlot.derive ?? this.derive;
        oimRefreshComputedSlot(
            computedSlot, derive as (computedSlot: TComputedSlot) => TValue, this.sameValueGuard, this.releaseValue,
            computedStoreSlot.channelSlot.clock,
        );
        return (computedSlot as unknown as OIMComputedSlot<TValue>).content;
    }

    public releaseSlotValue(computedSlot: TComputedSlot): void {
        if (computedSlot.ranAtRevision !== -1) this.releaseValue((computedSlot as unknown as OIMComputedSlot<TValue>).content);
    }
}
