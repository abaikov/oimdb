import type { TOIMColumnSlotOwnerOptions } from '../types/TOIMColumnSlotOwnerOptions';
import type { TOIMComputedColumnSlot } from '../types/TOIMComputedColumnSlot';
import { OIMPullColumnSlotOwner } from '../OIMPullColumnSlotOwner';

export const createOIMPullColumnSlotOwner = (
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot>,
): OIMPullColumnSlotOwner => new OIMPullColumnSlotOwner(columnSlotOwnerOptions);
