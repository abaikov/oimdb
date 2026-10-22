import type { TOIMColumnOwnerOptions } from '../types/TOIMColumnOwnerOptions';
import type { TOIMColumnSlot } from '../types/TOIMColumnSlot';
import { OIMColumnOwnerPushDriven } from '../OIMColumnOwnerPushDriven';

export const createOIMColumnOwnerPushDriven = (
    columnOwnerOptions: TOIMColumnOwnerOptions<TOIMColumnSlot>,
): OIMColumnOwnerPushDriven => new OIMColumnOwnerPushDriven(columnOwnerOptions);
