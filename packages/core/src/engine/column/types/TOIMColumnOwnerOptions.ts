import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';

export type TOIMColumnOwnerOptions<TColumnSlot extends TOIMKeyedSlot<string>, TColumnName extends string = string> =
    | { columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>; columnNames?: undefined }
    | { columnNames: readonly TColumnName[]; columnSlotStoreService?: undefined };
