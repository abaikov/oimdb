import { OIM_ACTIVE_SOURCE_TRACKER } from './constants/OIM_ACTIVE_SOURCE_TRACKER';
import { OIMSlot } from '../slot/OIMSlot';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { IOIMComputedValueService } from './interfaces/IOIMComputedValueService';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import type { OIMSourceTracker } from './OIMSourceTracker';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from './constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { OIMColumnSlotService } from '../column/OIMColumnSlotService';
import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMDisposer } from '../schedule/types/TOIMDisposer';
import { createOIMEffectDisposer } from '../effect/utils/createOIMEffectDisposer';
import { createOIMColumnGroup } from '../column/utils/createOIMColumnGroup';
import { OIM_FROZEN_EMPTY_SLOTS } from '../slot/constants/OIM_FROZEN_EMPTY_SLOTS';

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

    public rootSlots: readonly TOIMSlot[] | undefined;

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
        this.rootSlots = undefined;
        this.sourceTracker = sourceTracker;
    }

    public getColumnSlot(columnName: string): TOIMComputedColumnSlot<TSourceTracker> {
        return this.computedColumnSlotService().getColumnSlot(this, columnName) as TOIMComputedColumnSlot<TSourceTracker>;
    }

    public holdColumnSlot(columnName: string): TOIMComputedColumnSlot<TSourceTracker> {
        return this.computedColumnSlotService().holdColumnSlot(this, columnName) as TOIMComputedColumnSlot<TSourceTracker>;
    }

    public getAnyColumnSlot(): TOIMComputedColumnSlot<TSourceTracker> {
        return this.computedColumnSlotService().getAnyColumnSlot(this) as TOIMComputedColumnSlot<TSourceTracker>;
    }

    public holdAnyColumnSlot(): TOIMComputedColumnSlot<TSourceTracker> {
        return this.computedColumnSlotService().holdAnyColumnSlot(this) as TOIMComputedColumnSlot<TSourceTracker>;
    }

    public getColumnGroupSlot(columnGroup: TOIMColumnGroup): TOIMComputedColumnSlot<TSourceTracker> {
        return this.computedColumnSlotService().getColumnGroupSlot(this, columnGroup) as TOIMComputedColumnSlot<TSourceTracker>;
    }

    public holdColumnGroupSlot(columnGroup: TOIMColumnGroup): TOIMComputedColumnSlot<TSourceTracker> {
        return this.computedColumnSlotService().holdColumnGroupSlot(this, columnGroup) as TOIMComputedColumnSlot<TSourceTracker>;
    }

    public get value(): TValue {
        const value = this.computedValueService.getValueForSlot(this);
        OIM_ACTIVE_SOURCE_TRACKER.sourceTracker?.trackSourceComputed(this);
        return value;
    }

    public watch(body: (value: TValue) => void, columnNames?: readonly [string, ...string[]]): TOIMDisposer {
        const sourceComputedSlot: TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined> = columnNames === undefined ? this
            : columnNames.length === 1 ? this.getColumnSlot(columnNames[0]) : this.getColumnGroupSlot(createOIMColumnGroup(columnNames));
        return createOIMEffectDisposer(
            { defaultChannelSlot: this.storeSlot.channelSlot },
            () => { body(this.computedValueService.getValueForSlot(this)); },
            OIM_FROZEN_EMPTY_SLOTS, OIM_FROZEN_EMPTY_COMPUTED_SLOTS, [sourceComputedSlot],
        );
    }

    private computedColumnSlotService(): OIMColumnSlotService<OIMComputedSlot<TValue, TKey, TSourceTracker>, string, TOIMComputedColumnSlot, OIMPullColumnSlotOwner> {
        return (this.owner as unknown as { readonly columnSlotService: OIMColumnSlotService<OIMComputedSlot<TValue, TKey, TSourceTracker>, string, TOIMComputedColumnSlot, OIMPullColumnSlotOwner> }).columnSlotService;
    }
}
