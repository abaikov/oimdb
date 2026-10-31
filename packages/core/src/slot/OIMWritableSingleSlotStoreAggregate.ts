import type { IOIMSlotContentWriter } from './interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from './interfaces/IOIMSlotContentService';
import type { IOIMSingleSlotCreator } from './interfaces/IOIMSingleSlotCreator';
import type { OIMWritableSingleSlotService } from './OIMWritableSingleSlotService';
import type { TOIMSlot } from './types/TOIMSlot';
import { OIMSingleSlotStoreAggregate } from './OIMSingleSlotStoreAggregate';

export class OIMWritableSingleSlotStoreAggregate<
    TSlot extends TOIMSlot, TContent, TPatch,
    TSlotService extends OIMWritableSingleSlotService<
        TSlot, TContent, IOIMSlotContentWriter<TSlot, TContent> & IOIMSlotContentService<TSlot> & IOIMSingleSlotCreator<TSlot>
    >,
> extends OIMSingleSlotStoreAggregate<TSlot, TPatch, TSlotService> {
    public writeSingleSlotContent(content: TContent, changedSlots?: TSlot[]): TSlot {
        return this.slotService.writeSingleSlotContent(this.storeSlot, content, changedSlots);
    }

    public clearSingleSlotContent(): void {
        this.slotService.clearSingleSlotContent(this.storeSlot);
    }
}
