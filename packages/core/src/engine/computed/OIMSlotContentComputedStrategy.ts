import type { IOIMSlotContentStrategy } from '../slot/interfaces/IOIMSlotContentStrategy';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { OIMComputedValueService } from './OIMComputedValueService';
import type { TOIMComputedSlot } from './types/TOIMComputedSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from './types/TOIMComputedStoreSlot';
import type { TOIMSlotContentComputedStrategyOptions } from './types/TOIMSlotContentComputedStrategyOptions';
import { OIMComputedSourcesService } from './OIMComputedSourcesService';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from './constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
import { createOIMComputedSlot } from './utils/createOIMComputedSlot';

export class OIMSlotContentComputedStrategy<TKey, TValue>
implements IOIMSlotContentStrategy<TOIMComputedSlot<TValue, TKey>, TKey> {
    private readonly computedValueService: OIMComputedValueService<TKey, TValue>;

    private readonly createSources: ((key: TKey, storeSlot: TOIMStoreSlot | undefined) => Partial<TOIMComputedSources>) | undefined;

    private readonly initialValue: TValue;

    public constructor(options: TOIMSlotContentComputedStrategyOptions<TKey, TValue>) {
        this.computedValueService = options.computedValueService;
        this.createSources = options.createSources;
        this.initialValue = options.initialValue as TValue;
    }

    public createSlot(key: TKey, storeSlot: TOIMStoreSlot | undefined, slotOwnerService: IOIMSlotOwner): TOIMComputedSlot<TValue, TKey> {
        const createSources = (storeSlot as TOIMComputedStoreSlot<unknown, TValue, TKey> | undefined)?.createSources ?? this.createSources;
        const computedSources = (createSources as (key: TKey, storeSlot: TOIMStoreSlot | undefined) => Partial<TOIMComputedSources>)(
            key, storeSlot,
        );
        const computedSlot = createOIMComputedSlot<TValue, TKey>(
            key, slotOwnerService, this.computedValueService,
            computedSources.sourceSlots ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
            computedSources.sourceComputeds ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
            this.initialValue,
            storeSlot,
        );
        OIMComputedSourcesService.INSTANCE.holdSources(computedSlot);
        return computedSlot;
    }

    public isSlotEmpty(): boolean {
        return false;
    }

    public releaseSlotContent(computedSlot: TOIMComputedSlot<TValue, TKey>): void {
        OIMComputedSourcesService.INSTANCE.unholdSources(computedSlot);
    }

    public hasReference(): boolean {
        return false;
    }
}
