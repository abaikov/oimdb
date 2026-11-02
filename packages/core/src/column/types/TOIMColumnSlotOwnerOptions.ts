import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMColumnGroup } from './TOIMColumnGroup';

export type TOIMColumnSlotOwnerOptions<TColumnSlot extends TOIMKeyedSlot<string>, TColumnName extends string = string> = (
    | { columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>; columnNames?: undefined }
    | { columnNames: readonly TColumnName[]; columnSlotStoreService?: undefined }
) & { columnGroups?: readonly TOIMColumnGroup<TColumnName>[] | undefined };
