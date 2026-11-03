import type { OIMComputedSlot } from './OIMComputedSlot';
import type { TOIMSourceTrackingComputedContentSlot } from './types/TOIMSourceTrackingComputedContentSlot';
import type { TOIMSourceTrackingComputedDerive } from './types/TOIMSourceTrackingComputedDerive';
import type { TOIMSameValueGuard } from '../slot/types/TOIMSameValueGuard';
import type { TOIMComputedValueReleaser } from './types/TOIMComputedValueReleaser';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { OIMSourceTracker } from './OIMSourceTracker';
import { OIMComputedValueService } from './OIMComputedValueService';
import { OIMComputedSourcesService } from './OIMComputedSourcesService';
import { refreshOIMComputedSlot } from './utils/refreshOIMComputedSlot';
import { assertOIMSlotNotReleased } from '../slot/utils/assertOIMSlotNotReleased';
import { isOIMSlotReleased } from '../slot/utils/isOIMSlotReleased';
import { holdOIMSlots } from '../slot/utils/holdOIMSlots';
import { swapOIMActiveSourceTracker } from './utils/swapOIMActiveSourceTracker';

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
        assertOIMSlotNotReleased(computedSlot);
        const sourceTracker = computedSlot.sourceTracker;
        refreshOIMComputedSlot(computedSlot, this.deriveTrackingSources, this.sameValueGuard, this.releaseValue, computedSlot.storeSlot.channelSlot.clock);
        if (sourceTracker.trackReplacedRootSlots()) {
            (computedSlot as TOIMEditable<TComputedSlot>).rootSlots = sourceTracker.getTrackedRootSlots().slice();
            sourceTracker.commitTrackedSources();
        }
        return (computedSlot as unknown as OIMComputedSlot<TValue>).content;
    }

    private readonly deriveTrackingSources = (computedSlot: TComputedSlot): TValue => {
        const sourceTracker = computedSlot.sourceTracker;
        sourceTracker.openSourceTracking();
        const outerSourceTracker = swapOIMActiveSourceTracker(sourceTracker);
        let value: TValue;
        try {
            value = this.sourceTrackingDerive(computedSlot);
        } finally {
            swapOIMActiveSourceTracker(outerSourceTracker);
        }
        if (sourceTracker.closeSourceTracking() && !isOIMSlotReleased(computedSlot)) this.replaceSources(computedSlot, sourceTracker);
        return value;
    };

    private replaceSources(computedSlot: TComputedSlot, sourceTracker: OIMSourceTracker): void {
        const trackedSourceSlots = sourceTracker.getTrackedSourceSlots().slice();
        const trackedSourceComputeds = sourceTracker.getTrackedSourceComputeds().slice();
        holdOIMSlots(trackedSourceSlots);
        holdOIMSlots(trackedSourceComputeds);
        OIMComputedSourcesService.INSTANCE.unholdSources(computedSlot);
        const editableComputedSlot = computedSlot as TOIMEditable<TComputedSlot>;
        editableComputedSlot.sourceSlots = trackedSourceSlots;
        editableComputedSlot.sourceComputeds = trackedSourceComputeds;
        editableComputedSlot.rootSlots = sourceTracker.getTrackedRootSlots().slice();
        sourceTracker.commitTrackedSources();
    }
}
