import type { TOIMSourceTrackingComputedContentSlot } from './types/TOIMSourceTrackingComputedContentSlot';
import type { TOIMSourceTrackingComputedDerive } from './types/TOIMSourceTrackingComputedDerive';
import { OIMSingleSourceTrackingComputedService } from './OIMSingleSourceTrackingComputedService';
import type { TOIMComputedServiceFactoryOptions } from './types/TOIMComputedServiceFactoryOptions';
import { resolveOIMComputedDerivationOptions } from './utils/resolveOIMComputedDerivationOptions';

export function createOIMSingleSourceTrackingComputedService<TValue>(
    options: TOIMComputedServiceFactoryOptions<TValue> & {
        derive: TOIMSourceTrackingComputedDerive<TValue, TOIMSourceTrackingComputedContentSlot<TValue>>;
    },
): OIMSingleSourceTrackingComputedService<TValue> {
    return new OIMSingleSourceTrackingComputedService<TValue>({
        ...resolveOIMComputedDerivationOptions(options),
        derive: options.derive,
    });
}
