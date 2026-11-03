import type { TOIMComputedCarrierSlot } from './types/TOIMComputedCarrierSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import { OIMSingleComputedService } from './OIMSingleComputedService';
import type { TOIMComputedServiceFactoryOptions } from './types/TOIMComputedServiceFactoryOptions';
import { resolveOIMComputedDerivationOptions } from './utils/resolveOIMComputedDerivationOptions';

export function createOIMSingleComputedService<TValue>(
    options: TOIMComputedServiceFactoryOptions<TValue> & {
        createSources?: ((computedSlot: TOIMComputedCarrierSlot<TValue>) => Partial<TOIMComputedSources>) | undefined;
        derive?: ((computedSlot: TOIMComputedCarrierSlot<TValue>) => TValue) | undefined;
    } = {},
): OIMSingleComputedService<TValue> {
    return new OIMSingleComputedService<TValue>({
        ...resolveOIMComputedDerivationOptions(options),
        createSources: options.createSources,
        derive: options.derive,
    });
}
