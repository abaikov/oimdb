import type { IOIMSlotContentService } from '../slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../slot/interfaces/IOIMKeyedSlotCreator';
import type { IOIMSingleSlotCreator } from '../slot/interfaces/IOIMSingleSlotCreator';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMSlotEditable } from '../slot/types/TOIMSlotEditable';
import type { OIMComputedValueService } from './OIMComputedValueService';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import type { TOIMComputedSlot } from './types/TOIMComputedSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from './types/TOIMComputedStoreSlot';
import type { TOIMSlotContentComputedServiceOptions } from './types/TOIMSlotContentComputedServiceOptions';
import { OIMComputedSourcesService } from './OIMComputedSourcesService';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from './constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
import { createOIMComputedSlot } from './utils/createOIMComputedSlot';
import { createOIMSingleComputedSlot } from './utils/createOIMSingleComputedSlot';

export class OIMSlotContentComputedService<TValue, TComputedSlot extends TOIMComputedContentSlot<TValue> = TOIMComputedContentSlot<TValue>>
implements IOIMSlotContentService<TComputedSlot>,
    IOIMKeyedSlotCreator<NonNullable<unknown>, TOIMComputedSlot<TValue>>, IOIMSingleSlotCreator<TOIMComputedContentSlot<TValue>> {
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
    ): TComputedSlot & TOIMComputedSlot<TValue, TKey> {
        const computedSlot = createOIMComputedSlot<TValue, TKey>(
            key, slotOwner, this.computedValueService, this.initialValue, storeSlot,
        ) as TOIMComputedContentSlot<TValue> as TComputedSlot & TOIMComputedSlot<TValue, TKey>;
        this.attachSources(computedSlot, storeSlot);
        return computedSlot;
    }

    public createSingleSlot(storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TOIMComputedContentSlot<TValue> {
        const computedSlot = createOIMSingleComputedSlot<TValue>(slotOwner, this.computedValueService, this.initialValue, storeSlot);
        this.attachSources(computedSlot as TComputedSlot, storeSlot);
        return computedSlot;
    }

    public isSlotEmpty(): boolean {
        return false;
    }

    public releaseSlotContent(computedSlot: TComputedSlot): void {
        OIMComputedSourcesService.INSTANCE.unholdSources(computedSlot);
    }

    public hasReference(): boolean {
        return false;
    }

    private attachSources(computedSlot: TComputedSlot, storeSlot: TOIMStoreSlot): void {
        const createSources = (storeSlot as TOIMComputedStoreSlot<unknown, TValue, TComputedSlot>).createSources ?? this.createSources;
        const computedSources = (createSources as (computedSlot: TComputedSlot) => Partial<TOIMComputedSources>)(computedSlot);
        const computedSlotEditable = computedSlot as TOIMSlotEditable<TOIMComputedContentSlot<TValue>>;
        computedSlotEditable.sourceSlots = computedSources.sourceSlots ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
        computedSlotEditable.sourceComputeds = computedSources.sourceComputeds ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
        OIMComputedSourcesService.INSTANCE.holdSources(computedSlot);
    }
}
