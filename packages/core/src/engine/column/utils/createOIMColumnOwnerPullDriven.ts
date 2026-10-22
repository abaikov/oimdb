import type { TOIMColumnOwnerOptions } from '../types/TOIMColumnOwnerOptions';
import type { TOIMComputedColumnSlot } from '../types/TOIMComputedColumnSlot';
import { OIMColumnOwnerPullDriven } from '../OIMColumnOwnerPullDriven';

export const createOIMColumnOwnerPullDriven = (
    columnOwnerOptions: TOIMColumnOwnerOptions<TOIMComputedColumnSlot>,
): OIMColumnOwnerPullDriven => new OIMColumnOwnerPullDriven(columnOwnerOptions);
