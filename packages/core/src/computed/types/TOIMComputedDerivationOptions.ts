import type { IOIMSlotSubscriptionListener } from '../../slot/interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMStoreSlotListener } from '../../slot/interfaces/IOIMStoreSlotListener';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';
import type { TOIMComputedSources } from './TOIMComputedSources';
import type { TOIMComputedValueReleaser } from './TOIMComputedValueReleaser';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { TOIMColumnSlotOwnerOptions } from '../../column/types/TOIMColumnSlotOwnerOptions';

export type TOIMComputedDerivationOptions<TValue, TComputedSlot extends TOIMComputedContentSlot<TValue>> = {
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot, Extract<keyof TValue, string>>;
    slotReleasePolicy: IOIMSlotReleasePolicy;
    storeSlotListener: IOIMStoreSlotListener;
    slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
    createSources?: ((computedSlot: TComputedSlot) => Partial<TOIMComputedSources>) | undefined;
    derive?: ((computedSlot: TComputedSlot) => TValue) | undefined;
    sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
    releaseValue?: TOIMComputedValueReleaser<TValue> | undefined;
    initialValue?: TValue | undefined;
};
