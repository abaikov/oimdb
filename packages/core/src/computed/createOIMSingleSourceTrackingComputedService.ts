import type { TOIMSourceTrackingComputedContentSlot } from './types/TOIMSourceTrackingComputedContentSlot';
import type { TOIMSourceTrackingComputedDerive } from './types/TOIMSourceTrackingComputedDerive';
import { OIMSingleSourceTrackingComputedService } from './OIMSingleSourceTrackingComputedService';
import type { TOIMComputedServiceFactoryOptions } from './types/TOIMComputedServiceFactoryOptions';
import { oimResolveComputedDerivationOptions } from './utils/oimResolveComputedDerivationOptions';

export function createOIMSingleSourceTrackingComputedService<TValue>(
    options: TOIMComputedServiceFactoryOptions<TValue> & {
        derive: TOIMSourceTrackingComputedDerive<TValue, TOIMSourceTrackingComputedContentSlot<TValue>>;
    },
): OIMSingleSourceTrackingComputedService<TValue> {
    return new OIMSingleSourceTrackingComputedService<TValue>({
        ...oimResolveComputedDerivationOptions(options),
        derive: options.derive,
    });
}
