import type { IOIMSlotStamp } from '../interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotContentStrategy } from '../interfaces/IOIMSlotContentStrategy';
import type { IOIMSlotContentFlushStrategy } from '../interfaces/IOIMSlotContentFlushStrategy';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMColumnOwnerOptions } from '../../column/types/TOIMColumnOwnerOptions';
import type { TOIMKeyedSlot } from './TOIMKeyedSlot';
import type { TOIMSlot } from './TOIMSlot';
import type { OIMColumnOwner } from '../../column/OIMColumnOwner';
import type { OIMSlotOwnerService } from '../OIMSlotOwnerService';

export type TOIMSlotOwnerServiceOptions<
    TKey, TSlot extends TOIMKeyedSlot<TKey>, TStore, TColumnName extends string, TColumnSlot extends TOIMKeyedSlot<string>,
    TColumnOwner extends OIMColumnOwner<TOIMSlot, TColumnSlot>, TPatch,
> = {
    slotStamp?: IOIMSlotStamp<TSlot> | undefined;
    slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
    slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore>;
    slotContentStrategy: IOIMSlotContentStrategy<
        TSlot, TKey, OIMSlotOwnerService<TKey, TSlot, TStore, TColumnName, TColumnSlot, TColumnOwner, TPatch>
    >;
    slotContentFlushStrategy?: IOIMSlotContentFlushStrategy<
        TSlot, OIMSlotOwnerService<TKey, TSlot, TStore, TColumnName, TColumnSlot, TColumnOwner, TPatch>
    > | undefined;
    columnOwnerOptions: TOIMColumnOwnerOptions<TColumnSlot, TColumnName>;
    createColumnOwner: (columnOwnerOptions: TOIMColumnOwnerOptions<TColumnSlot, TColumnName>) => TColumnOwner;
};
