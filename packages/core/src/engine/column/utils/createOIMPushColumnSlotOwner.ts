import type { TOIMColumnSlotOwnerOptions } from '../types/TOIMColumnSlotOwnerOptions';
import type { TOIMColumnSlot } from '../types/TOIMColumnSlot';
import { OIMPushColumnSlotOwner } from '../OIMPushColumnSlotOwner';

export const createOIMPushColumnSlotOwner = (
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMColumnSlot>,
): OIMPushColumnSlotOwner => new OIMPushColumnSlotOwner(columnSlotOwnerOptions);
