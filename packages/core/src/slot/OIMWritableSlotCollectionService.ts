import type { IOIMSlotContentWriter } from './interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from './interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from './interfaces/IOIMKeyedSlotCreator';
import type { OIMColumnSlotOwner } from '../column/OIMColumnSlotOwner';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import { OIMSlotCollectionService } from './OIMSlotCollectionService';
import { OIMWritableSlotCollectionStoreAggregate } from './OIMWritableSlotCollectionStoreAggregate';

export class OIMWritableSlotCollectionService<
    TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TStore, TContent,
    TSlotContentService extends IOIMSlotContentWriter<TSlot, TContent> & IOIMSlotContentService<TSlot> & IOIMKeyedSlotCreator<TKey, TSlot>,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot> = OIMColumnSlotOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> extends OIMSlotCollectionService<TKey, TSlot, TStore, TSlotContentService, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch> {
    public override createStoreAggregate(
        storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch, this>,
    ): OIMWritableSlotCollectionStoreAggregate<TKey, TSlot, TStore, TContent, TPatch, this> {
        return new OIMWritableSlotCollectionStoreAggregate(this, storeSlot);
    }

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
