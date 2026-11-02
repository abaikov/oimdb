import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { TOIMIndexableSlot } from '../slot/types/TOIMIndexableSlot';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from './types/TOIMComputedStoreSlot';
import type { TOIMExplicitSourceComputedContentServiceOptions } from './types/TOIMExplicitSourceComputedContentServiceOptions';
import { OIMComputedContentService } from './OIMComputedContentService';
import { OIMComputedSourcesService } from './OIMComputedSourcesService';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from './constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';

export class OIMExplicitSourceComputedContentService<
    TValue, TComputedSlot extends TOIMComputedContentSlot<TValue> = TOIMComputedContentSlot<TValue>,
> extends OIMComputedContentService<TValue, TComputedSlot> {
    private readonly createSources: ((computedSlot: TComputedSlot) => Partial<TOIMComputedSources>) | undefined;

    public constructor(options: TOIMExplicitSourceComputedContentServiceOptions<TValue, TComputedSlot>) {
        super(options);
        this.createSources = options.createSources;
    }

    public override createSlot<TKey extends NonNullable<unknown>>(
        key: TKey, storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner,
    ): TComputedSlot & TOIMIndexableSlot<TKey> {
        const computedSlot = super.createSlot(key, storeSlot, slotOwner);
        this.attachSources(computedSlot, storeSlot);
        return computedSlot;
    }

    public override createSingleSlot(storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TComputedSlot {
        const computedSlot = super.createSingleSlot(storeSlot, slotOwner);
        this.attachSources(computedSlot, storeSlot);
        return computedSlot;
    }

    private attachSources(computedSlot: TComputedSlot, storeSlot: TOIMStoreSlot): void {
        const createSources = (storeSlot as TOIMComputedStoreSlot<unknown, TValue, TComputedSlot>).createSources ?? this.createSources;
        const computedSources = (createSources as (computedSlot: TComputedSlot) => Partial<TOIMComputedSources>)(computedSlot);
        const editableComputedSlot = computedSlot as TOIMEditable<TOIMComputedContentSlot<TValue>>;
        editableComputedSlot.sourceSlots = computedSources.sourceSlots ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
        editableComputedSlot.sourceComputeds = computedSources.sourceComputeds ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
        OIMComputedSourcesService.INSTANCE.holdSources(computedSlot);
    }
}
