import type { IOIMEntityWriter } from '../../engine/entity/interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptiness } from '../../engine/slot/interfaces/IOIMSlotEmptiness';
import type { IOIMSlotReleasePolicy } from '../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';

export type TOIMSlotContentEntityServiceFactoryOptions<TEntity extends object, TKey, TColumnName extends string> = {
    entityWriter?: IOIMEntityWriter | undefined;
    slotEmptiness?: IOIMSlotEmptiness<TOIMEntitySlot<TEntity, TKey>> | undefined;
    slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
    columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
    columnNames?: readonly TColumnName[] | undefined;
};
