import { OIM_ACTIVE_SOURCE_TRACKER } from './constants/OIM_ACTIVE_SOURCE_TRACKER';
import type { OIMComputedSlot } from './OIMComputedSlot';
import type { TOIMSourceTrackingComputedContentSlot } from './types/TOIMSourceTrackingComputedContentSlot';
import type { TOIMSourceTrackingComputedDerive } from './types/TOIMSourceTrackingComputedDerive';
import type { TOIMSameValueGuard } from '../slot/types/TOIMSameValueGuard';
import type { TOIMComputedValueReleaser } from './types/TOIMComputedValueReleaser';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { OIMSourceTracker } from './OIMSourceTracker';
import { OIMComputedValueService } from './OIMComputedValueService';
import { OIMComputedSourcesService } from './OIMComputedSourcesService';
import { oimRefreshComputedSlot } from './utils/oimRefreshComputedSlot';
import { oimAssertSlotNotReleased } from '../slot/utils/oimAssertSlotNotReleased';
import { oimIsSlotReleased } from '../slot/utils/oimIsSlotReleased';
import { oimHoldSlots } from '../slot/utils/oimHoldSlots';

export class OIMSourceTrackingComputedValueService<
    TValue, TComputedSlot extends TOIMSourceTrackingComputedContentSlot<TValue> = TOIMSourceTrackingComputedContentSlot<TValue>,
> extends OIMComputedValueService<TValue, TComputedSlot> {
    private readonly sourceTrackingDerive: TOIMSourceTrackingComputedDerive<TValue, TComputedSlot>;

    public constructor(options: {
        derive: TOIMSourceTrackingComputedDerive<TValue, TComputedSlot>;
        sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
        releaseValue?: TOIMComputedValueReleaser<TValue> | undefined;
    }) {
        super({ sameValueGuard: options.sameValueGuard, releaseValue: options.releaseValue });
        this.sourceTrackingDerive = options.derive;
    }

    public override getValueForSlot(computedSlot: TComputedSlot): TValue {
        oimAssertSlotNotReleased(computedSlot);
        const sourceTracker = computedSlot.sourceTracker;
        oimRefreshComputedSlot(computedSlot, this.deriveTrackingSources, this.sameValueGuard, this.releaseValue, computedSlot.storeSlot.channelSlot.clock);
        if (sourceTracker.trackReplacedRootSlots()) {
            (computedSlot as TOIMEditable<TComputedSlot>).allRootSlots = sourceTracker.getTrackedAllRootSlots().slice();
            sourceTracker.commitTrackedSources();
        }
        return (computedSlot as unknown as OIMComputedSlot<TValue>).content;
    }

    private readonly deriveTrackingSources = (computedSlot: TComputedSlot): TValue => {
        const sourceTracker = computedSlot.sourceTracker;
        sourceTracker.openSourceTracking();
        OIM_ACTIVE_SOURCE_TRACKER.sourceTracker = sourceTracker;
        let value: TValue;
        try {
            value = this.sourceTrackingDerive(computedSlot);
        } finally {
            OIM_ACTIVE_SOURCE_TRACKER.sourceTracker = undefined;
        }
        if (sourceTracker.closeSourceTracking() && !oimIsSlotReleased(computedSlot)) this.replaceSources(computedSlot, sourceTracker);
        return value;
    };

    private replaceSources(computedSlot: TComputedSlot, sourceTracker: OIMSourceTracker): void {
        const trackedSourceSlots = sourceTracker.getTrackedSourceSlots().slice();
        const trackedSourceComputeds = sourceTracker.getTrackedSourceComputeds().slice();
        oimHoldSlots(trackedSourceSlots);
        oimHoldSlots(trackedSourceComputeds);
        OIMComputedSourcesService.INSTANCE.unholdSources(computedSlot);
        const editableComputedSlot = computedSlot as TOIMEditable<TComputedSlot>;
        editableComputedSlot.sourceSlots = trackedSourceSlots;
        editableComputedSlot.sourceComputeds = trackedSourceComputeds;
        editableComputedSlot.allRootSlots = sourceTracker.getTrackedAllRootSlots().slice();
        sourceTracker.commitTrackedSources();
    }
}
