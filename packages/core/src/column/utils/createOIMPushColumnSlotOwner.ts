import type { IOIMSlotSubscriptionListener } from '../../slot/interfaces/IOIMSlotSubscriptionListener';
import type { TOIMColumnSlotOwnerOptions } from '../types/TOIMColumnSlotOwnerOptions';
import type { TOIMColumnSlot } from '../types/TOIMColumnSlot';
import { OIMPushColumnSlotOwner } from '../OIMPushColumnSlotOwner';

export const createOIMPushColumnSlotOwner = (
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMColumnSlot>, slotSubscriptionListener?: IOIMSlotSubscriptionListener,
): OIMPushColumnSlotOwner => new OIMPushColumnSlotOwner(columnSlotOwnerOptions, slotSubscriptionListener);
