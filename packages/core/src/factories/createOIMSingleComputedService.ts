import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedColumnSlot } from '../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMComputedContentSlot } from '../engine/computed/types/TOIMComputedContentSlot';
import type { TOIMComputedSources } from '../engine/computed/types/TOIMComputedSources';
import type { TOIMSameValueGuard } from '../engine/slot/types/TOIMSameValueGuard';
import { OIMSlotAtUnholdReleasePolicy } from '../engine/collector/OIMSlotAtUnholdReleasePolicy';
import { OIMSingleComputedService } from '../facade/computed/OIMSingleComputedService';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from './defaults/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimColumnOwnerOptionsWithDefault } from './utils/oimColumnOwnerOptionsWithDefault';

export function createOIMSingleComputedService<TValue>(
    options: {
        createSources?: ((computedSlot: TOIMComputedContentSlot<TValue>) => Partial<TOIMComputedSources>) | undefined;
        derive?: ((computedSlot: TOIMComputedContentSlot<TValue>) => TValue) | undefined;
        sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
        initialValue?: TValue | undefined;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
        columnNames?: readonly Extract<keyof TValue, string>[] | undefined;
    } = {},
): OIMSingleComputedService<TValue> {
    return new OIMSingleComputedService<TValue>({
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
