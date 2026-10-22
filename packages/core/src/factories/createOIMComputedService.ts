import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedColumnSlot } from '../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from '../engine/computed/types/TOIMComputedSlot';
import type { TOIMComputedSources } from '../engine/computed/types/TOIMComputedSources';
import type { TOIMSameValueGuard } from '../engine/slot/types/TOIMSameValueGuard';
import type { TOIMStoreSlot } from '../engine/slot/types/TOIMStoreSlot';
import type { TOIMDefaultSlotStore } from '../engine/store/types/TOIMDefaultSlotStore';
import { OIMSlotReleasePolicyAtUnhold } from '../engine/collector/OIMSlotReleasePolicyAtUnhold';
import { OIMComputedService } from '../facade/computed/OIMComputedService';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from './defaults/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimColumnOwnerOptionsWithDefault } from './utils/oimColumnOwnerOptionsWithDefault';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';

export function createOIMComputedService<
    TKey, TValue, TComputedStore = TOIMDefaultSlotStore<TKey, TOIMComputedSlot<TValue, TKey>>,
>(
    options: {
        createSources?: ((key: TKey, storeSlot: TOIMStoreSlot | undefined) => Partial<TOIMComputedSources>) | undefined;
        derive?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined;
        sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
        initialValue?: TValue | undefined;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
        columnNames?: readonly Extract<keyof TValue, string>[] | undefined;
    } & ([TComputedStore] extends [Map<TKey, TOIMComputedSlot<TValue, TKey>>]
        ? { computedSlotStoreService?: IOIMSlotStoreService<TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore> | undefined }
        : { computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore> }),
): OIMComputedService<TKey, TValue, TComputedStore> {
    return new OIMComputedService<TKey, TValue, TComputedStore>({
        computedSlotStoreService: oimSlotStoreServiceWithDefault(options.computedSlotStoreService),
        columnOwnerOptions: oimColumnOwnerOptionsWithDefault(
            options.columnSlotStoreService, options.columnNames, OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue(),
        ),
        slotReleasePolicy: options.slotReleasePolicy ?? OIMSlotReleasePolicyAtUnhold.INSTANCE,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
        createSources: options.createSources,
        derive: options.derive,
        sameValueGuard: options.sameValueGuard,
        initialValue: options.initialValue,
    });
}
