import type { TOIMComputedServiceFactoryOptions } from '../types/TOIMComputedServiceFactoryOptions';
import type { TOIMComputedDerivationOptions } from '../types/TOIMComputedDerivationOptions';
import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import { OIMDefaults } from '../../db/OIMDefaults';
import { OIMSlotAtUnholdReleasePolicy } from '../../collector/OIMSlotAtUnholdReleasePolicy';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from '../../db/constants/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { resolveOIMColumnSlotOwnerOptions } from '../../column/utils/resolveOIMColumnSlotOwnerOptions';

export function resolveOIMComputedDerivationOptions<TValue>(
    options: TOIMComputedServiceFactoryOptions<TValue>,
): Omit<TOIMComputedDerivationOptions<TValue, TOIMComputedContentSlot<TValue>>, 'derive' | 'createSources'> {
    const defaults = options.defaults ?? OIMDefaults.INSTANCE;
    return {
        columnSlotOwnerOptions: resolveOIMColumnSlotOwnerOptions(
            options.columnSlotStoreService, options.columnNames, options.columnGroups,
            defaults.computedColumnSlotStoreService ?? OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue(),
        ),
        slotReleasePolicy: options.slotReleasePolicy ?? OIMSlotAtUnholdReleasePolicy.INSTANCE,
        storeSlotListener: defaults.storeSlotListener ?? OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
        slotSubscriptionListener: options.slotSubscriptionListener,
        sameValueGuard: options.sameValueGuard,
        releaseValue: options.releaseValue,
        initialValue: options.initialValue,
    };
}
