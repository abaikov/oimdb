import type { TOIMComputedServiceFactoryOptions } from '../types/TOIMComputedServiceFactoryOptions';
import type { TOIMComputedDerivationOptions } from '../types/TOIMComputedDerivationOptions';
import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import { OIMSlotAtUnholdReleasePolicy } from '../../collector/OIMSlotAtUnholdReleasePolicy';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from '../../db/constants/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimResolveColumnSlotOwnerOptions } from '../../column/utils/oimResolveColumnSlotOwnerOptions';

export function oimResolveComputedDerivationOptions<TValue>(
    options: TOIMComputedServiceFactoryOptions<TValue>,
): Omit<TOIMComputedDerivationOptions<TValue, TOIMComputedContentSlot<TValue>>, 'derive' | 'createSources'> {
    return {
        columnSlotOwnerOptions: oimResolveColumnSlotOwnerOptions(
            options.columnSlotStoreService, options.columnNames, OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue(),
        ),
        slotReleasePolicy: options.slotReleasePolicy ?? OIMSlotAtUnholdReleasePolicy.INSTANCE,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
        sameValueGuard: options.sameValueGuard,
        releaseValue: options.releaseValue,
        initialValue: options.initialValue,
    };
}
