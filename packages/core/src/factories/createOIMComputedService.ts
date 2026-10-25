import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedColumnSlot } from '../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from '../engine/computed/types/TOIMComputedSlot';
import type { TOIMComputedSources } from '../engine/computed/types/TOIMComputedSources';
import type { TOIMSameValueGuard } from '../engine/slot/types/TOIMSameValueGuard';
import { OIMSlotAtUnholdReleasePolicy } from '../engine/collector/OIMSlotAtUnholdReleasePolicy';
import { OIMComputedService } from '../facade/computed/OIMComputedService';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from './defaults/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimColumnOwnerOptionsWithDefault } from './utils/oimColumnOwnerOptionsWithDefault';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';

export function createOIMComputedService<
    TKey extends NonNullable<unknown>, TValue, TComputedStore = Map<TKey, TOIMComputedSlot<TValue, TKey>>,
>(
    options: {
        createSources?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => Partial<TOIMComputedSources>) | undefined;
        derive?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined;
        sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
        initialValue?: TValue | undefined;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
        columnNames?: readonly Extract<keyof TValue, string>[] | undefined;
        computedSlotStoreService?: IOIMSlotStoreService<TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore> | undefined;
    },
): OIMComputedService<TKey, TValue, TComputedStore> {
    return new OIMComputedService<TKey, TValue, TComputedStore>({
        computedSlotStoreService: oimSlotStoreServiceWithDefault(options.computedSlotStoreService),
        columnSlotOwnerOptions: oimColumnOwnerOptionsWithDefault(
            options.columnSlotStoreService, options.columnNames, OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue(),
        ),
        slotReleasePolicy: options.slotReleasePolicy ?? OIMSlotAtUnholdReleasePolicy.INSTANCE,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
        createSources: options.createSources,
        derive: options.derive,
        sameValueGuard: options.sameValueGuard,
        initialValue: options.initialValue,
    });
}
