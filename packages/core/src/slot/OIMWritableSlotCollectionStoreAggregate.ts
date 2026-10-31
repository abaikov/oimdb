import type { IOIMSlotContentWriter } from './interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from './interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from './interfaces/IOIMKeyedSlotCreator';
import type { OIMWritableSlotCollectionService } from './OIMWritableSlotCollectionService';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import { OIMSlotCollectionStoreAggregate } from './OIMSlotCollectionStoreAggregate';

export class OIMWritableSlotCollectionStoreAggregate<
    TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TStore, TContent, TPatch,
    TSlotService extends OIMWritableSlotCollectionService<
        TKey, TSlot, TStore, TContent, IOIMSlotContentWriter<TSlot, TContent> & IOIMSlotContentService<TSlot> & IOIMKeyedSlotCreator<TKey, TSlot>
    >,
> extends OIMSlotCollectionStoreAggregate<TKey, TSlot, TStore, TPatch, TSlotService> {
    public writeSlotContentByKey(key: TKey, content: TContent, changedSlots?: TSlot[]): TSlot {
        return this.slotService.writeSlotContentByKey(this.storeSlot, key, content, changedSlots);
    }
}
