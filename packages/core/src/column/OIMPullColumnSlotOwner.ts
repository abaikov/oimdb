import type { IOIMSlotSubscriptionListener } from '../slot/interfaces/IOIMSlotSubscriptionListener';
import type { TOIMComputedContentSlot } from '../computed/types/TOIMComputedContentSlot';
import type { IOIMComputedValueService } from '../computed/interfaces/IOIMComputedValueService';
import type { TOIMComputedColumnSlot } from './types/TOIMComputedColumnSlot';
import type { TOIMColumnSlotOwnerOptions } from './types/TOIMColumnSlotOwnerOptions';
import type { OIMSourceTracker } from '../computed/OIMSourceTracker';
import { OIMColumnSlotOwner } from './OIMColumnSlotOwner';
import { OIMColumnSlot } from './OIMColumnSlot';
import { OIM_ACTIVE_SOURCE_TRACKER } from '../computed/constants/OIM_ACTIVE_SOURCE_TRACKER';
import { refreshOIMComputedSlot } from '../computed/utils/refreshOIMComputedSlot';
import { releaseOIMNoValue } from '../computed/utils/releaseOIMNoValue';
import { isOIMSameColumnValue } from './utils/isOIMSameColumnValue';

export class OIMPullColumnSlotOwner
    extends OIMColumnSlotOwner<TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>, TOIMComputedColumnSlot>
    implements IOIMComputedValueService {
    public constructor(columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot>, slotSubscriptionListener?: IOIMSlotSubscriptionListener) {
        super(columnSlotOwnerOptions, slotSubscriptionListener);
    }

    private readonly deriveColumnSlotValue = (columnSlot: TOIMComputedColumnSlot): unknown => this.peekCarrierColumnValue(columnSlot);

    public getValueForSlot(computedSlot: TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>): unknown {
        this.assertNotReleased(computedSlot);
        const columnSlot = computedSlot as TOIMComputedColumnSlot;
        refreshOIMComputedSlot(
            columnSlot, this.deriveColumnSlotValue, isOIMSameColumnValue, releaseOIMNoValue, columnSlot.storeSlot.channelSlot.clock,
        );
        return (columnSlot as unknown as OIMColumnSlot).content;
    }

    public trackSourceColumnSlot(columnSlot: TOIMComputedColumnSlot): void {
        OIM_ACTIVE_SOURCE_TRACKER.sourceTracker?.trackSourceComputed(columnSlot);
    }

    protected createColumnSlot(carrierSlot: TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>, key: string): TOIMComputedColumnSlot {
        const columnSlot = new OIMColumnSlot(key, this, carrierSlot, [carrierSlot], carrierSlot.sourceTracker) as unknown as TOIMComputedColumnSlot;
        this.getValueForSlot(columnSlot);
        return columnSlot;
    }

    protected carrierSlotOf(columnSlot: TOIMComputedColumnSlot): TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined> {
        return columnSlot.carrierSlot;
    }
}
