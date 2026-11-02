import type { IOIMSlotSubscriptionListener } from '../../slot/interfaces/IOIMSlotSubscriptionListener';
import type { TOIMColumnSlotOwnerOptions } from '../types/TOIMColumnSlotOwnerOptions';
import type { TOIMComputedColumnSlot } from '../types/TOIMComputedColumnSlot';
import { OIMPullColumnSlotOwner } from '../OIMPullColumnSlotOwner';

export const createOIMPullColumnSlotOwner = (
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot>, slotSubscriptionListener?: IOIMSlotSubscriptionListener,
): OIMPullColumnSlotOwner => new OIMPullColumnSlotOwner(columnSlotOwnerOptions, slotSubscriptionListener);
