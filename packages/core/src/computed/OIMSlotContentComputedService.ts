import type { IOIMSlotContentService } from '../slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../slot/interfaces/IOIMKeyedSlotCreator';
import type { IOIMSingleSlotCreator } from '../slot/interfaces/IOIMSingleSlotCreator';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { OIMComputedValueService } from './OIMComputedValueService';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import type { TOIMIndexableSlot } from '../slot/types/TOIMIndexableSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from './types/TOIMComputedStoreSlot';
import type { TOIMSlotContentComputedServiceOptions } from './types/TOIMSlotContentComputedServiceOptions';
import { OIMComputedSourcesService } from './OIMComputedSourcesService';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from './constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
import { createOIMComputedSlot } from './utils/createOIMComputedSlot';
import { createOIMComputedContentSlot } from './utils/createOIMComputedContentSlot';
import { oimAssertSlotUnheld } from '../slot/utils/oimAssertSlotUnheld';
import type { OIMSourceTracker } from './OIMSourceTracker';

export class OIMSlotContentComputedService<
    TValue, TComputedSlot extends TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined> = TOIMComputedContentSlot<TValue>,
>
implements IOIMSlotContentService<TComputedSlot>,
    IOIMKeyedSlotCreator<NonNullable<unknown>, TComputedSlot & TOIMIndexableSlot>, IOIMSingleSlotCreator<TComputedSlot> {
    private readonly computedValueService: OIMComputedValueService<TValue, TComputedSlot>;

    private readonly createSources: ((computedSlot: TComputedSlot) => Partial<TOIMComputedSources>) | undefined;

    private readonly initialValue: TValue;

    public constructor(options: TOIMSlotContentComputedServiceOptions<TValue, TComputedSlot>) {
        this.computedValueService = options.computedValueService;
        this.createSources = options.createSources;
        this.initialValue = options.initialValue as TValue;
    }

    public createSlot<TKey extends NonNullable<unknown>>(
        key: TKey, storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner,
    ): TComputedSlot & TOIMIndexableSlot<TKey> {
        const computedSlot = createOIMComputedSlot<TValue, TKey>(
            key, slotOwner, this.computedValueService, this.initialValue, storeSlot, this.createSourceTracker(),
        ) as unknown as TComputedSlot & TOIMIndexableSlot<TKey>;
        this.attachSources(computedSlot, storeSlot);
        return computedSlot;
    }

    public createSingleSlot(storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TComputedSlot {
        const computedSlot = createOIMComputedContentSlot<TValue>(
            slotOwner, this.computedValueService, this.initialValue, storeSlot, this.createSourceTracker(),
        ) as TComputedSlot;
        this.attachSources(computedSlot, storeSlot);
        return computedSlot;
    }

    public isSlotEmpty(): boolean {
        return false;
    }

    public releaseSlotContent(computedSlot: TComputedSlot): void {
        oimAssertSlotUnheld(computedSlot);
        OIMComputedSourcesService.INSTANCE.unholdSources(computedSlot);
        this.computedValueService.releaseSlotValue(computedSlot);
    }

    public hasReference(): boolean {
        return false;
    }

    protected createSourceTracker(): OIMSourceTracker | undefined {
        return undefined;
    }

    protected attachSources(computedSlot: TComputedSlot, storeSlot: TOIMStoreSlot): void {
        const createSources = (storeSlot as TOIMComputedStoreSlot<unknown, TValue, TComputedSlot>).createSources ?? this.createSources;
        const computedSources = (createSources as (computedSlot: TComputedSlot) => Partial<TOIMComputedSources>)(computedSlot);
        const editableComputedSlot = computedSlot as TOIMEditable<TOIMComputedContentSlot<TValue>>;
        editableComputedSlot.sourceSlots = computedSources.sourceSlots ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
        editableComputedSlot.sourceComputeds = computedSources.sourceComputeds ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
        OIMComputedSourcesService.INSTANCE.holdSources(computedSlot);
    }
}
