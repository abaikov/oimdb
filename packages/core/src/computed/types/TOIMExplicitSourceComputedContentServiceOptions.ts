import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';
import type { TOIMComputedSources } from './TOIMComputedSources';
import type { TOIMComputedContentServiceOptions } from './TOIMComputedContentServiceOptions';

export type TOIMExplicitSourceComputedContentServiceOptions<TValue, TComputedSlot extends TOIMComputedContentSlot<TValue>> =
    TOIMComputedContentServiceOptions<TValue, TComputedSlot> & {
        createSources?: ((computedSlot: TComputedSlot) => Partial<TOIMComputedSources>) | undefined;
    };
