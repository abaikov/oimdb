import type { IOIMSlotSubscriptionListener } from '../../slot/interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMStoreSlotListener } from '../../slot/interfaces/IOIMStoreSlotListener';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import type { TOIMComputedValueReleaser } from './TOIMComputedValueReleaser';
import type { TOIMSourceTrackingComputedDerive } from './TOIMSourceTrackingComputedDerive';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { TOIMColumnSlotOwnerOptions } from '../../column/types/TOIMColumnSlotOwnerOptions';

export type TOIMSourceTrackingComputedDerivationOptions<TValue, TComputedSlot> = {
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot, Extract<keyof TValue, string>>;
    slotReleasePolicy: IOIMSlotReleasePolicy;
    storeSlotListener: IOIMStoreSlotListener;
    slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
    derive: TOIMSourceTrackingComputedDerive<TValue, TComputedSlot>;
    sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
    releaseValue?: TOIMComputedValueReleaser<TValue> | undefined;
    initialValue?: TValue | undefined;
};
