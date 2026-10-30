import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import { OIMSingleComputedService } from './OIMSingleComputedService';
import type { TOIMComputedServiceFactoryOptions } from './types/TOIMComputedServiceFactoryOptions';
import { oimResolveComputedDerivationOptions } from './utils/oimResolveComputedDerivationOptions';

export function createOIMSingleComputedService<TValue>(
    options: TOIMComputedServiceFactoryOptions<TValue> & {
        createSources?: ((computedSlot: TOIMComputedContentSlot<TValue>) => Partial<TOIMComputedSources>) | undefined;
        derive?: ((computedSlot: TOIMComputedContentSlot<TValue>) => TValue) | undefined;
    } = {},
): OIMSingleComputedService<TValue> {
    return new OIMSingleComputedService<TValue>({
        ...oimResolveComputedDerivationOptions(options),
        createSources: options.createSources,
        derive: options.derive,
    });
}
