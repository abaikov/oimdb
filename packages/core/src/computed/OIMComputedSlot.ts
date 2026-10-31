import { OIM_ACTIVE_SOURCE_TRACKER } from './constants/OIM_ACTIVE_SOURCE_TRACKER';
import { OIMSlot } from '../slot/OIMSlot';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { IOIMComputedValueService } from './interfaces/IOIMComputedValueService';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import type { OIMSourceTracker } from './OIMSourceTracker';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from './constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';

export class OIMComputedSlot<TValue = unknown, TKey extends NonNullable<unknown> = NonNullable<unknown>, TSourceTracker extends OIMSourceTracker | undefined = OIMSourceTracker | undefined> extends OIMSlot {
    public computedValueService: IOIMComputedValueService<TValue>;

    public key: TKey;

    public indexKeys: unknown[] | undefined;

    public sourceSlots: readonly TOIMSlot[];

    public sourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[];

    public content: TValue;

    public ranAtRevision: number;

    public ranAtEpoch: number;

    public checkedAtRevision: number;

    public checkedAtEpoch: number;

    public isDeriving: boolean;

    public allRootSlots: readonly TOIMSlot[] | undefined;

    public sourceTracker: TSourceTracker;

    public constructor(
        key: TKey, owner: IOIMSlotOwner, computedValueService: IOIMComputedValueService<TValue>, initialValue: TValue,
        storeSlot: TOIMStoreSlot, sourceTracker: TSourceTracker,
    ) {
        super(owner, storeSlot);
        this.computedValueService = computedValueService;
        this.key = key;
        this.indexKeys = undefined;
        this.sourceSlots = OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
        this.sourceComputeds = OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
        this.content = initialValue;
        this.ranAtRevision = -1;
        this.ranAtEpoch = -1;
        this.checkedAtRevision = -1;
        this.checkedAtEpoch = -1;
        this.isDeriving = false;
        this.allRootSlots = undefined;
        this.sourceTracker = sourceTracker;
    }

    public get value(): TValue {
        const value = this.computedValueService.getValueForSlot(this);
        OIM_ACTIVE_SOURCE_TRACKER.sourceTracker?.trackSourceComputed(this);
        return value;
    }
}
