import type { IOIMSlotContentWriter } from '../../engine/slot/interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from '../../engine/slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../../engine/slot/interfaces/IOIMKeyedSlotCreator';
import type { OIMColumnSlotOwner } from '../../engine/column/OIMColumnSlotOwner';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import { OIMSlotCollectionService } from './OIMSlotCollectionService';

export class OIMWritableSlotCollectionService<
    TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TStore, TContent,
    TSlotContentService extends IOIMSlotContentWriter<TSlot, TContent> & IOIMSlotContentService<TSlot> & IOIMKeyedSlotCreator<TKey, TSlot>,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot> = OIMColumnSlotOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> extends OIMSlotCollectionService<TKey, TSlot, TStore, TSlotContentService, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch> {
    public writeSlotContentByKey(
        storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, key: TKey, content: TContent, changedSlots?: TSlot[],
    ): TSlot {
        const filed = this.slotStoreService.get(storeSlot.store, key);
        if (filed !== undefined) {
            if (this.slotContentService.writeSlotContent(filed, content) && changedSlots !== undefined) changedSlots.push(filed);
            return filed;
        }
        const slot = this.slotContentService.createSlot(this.slotStoreService.ownKey(key), storeSlot as TOIMStoreSlot, this.slotOwnerService);
        this.slotContentService.insertSlotContent(slot, content, changedSlots);
        return slot;
    }
}
