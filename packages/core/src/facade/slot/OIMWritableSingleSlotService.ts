import type { IOIMSlotContentWriter } from '../../engine/slot/interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from '../../engine/slot/interfaces/IOIMSlotContentService';
import type { IOIMSingleSlotCreator } from '../../engine/slot/interfaces/IOIMSingleSlotCreator';
import type { OIMColumnSlotOwner } from '../../engine/column/OIMColumnSlotOwner';
import type { TOIMSingleSlotStore } from '../../engine/store/types/TOIMSingleSlotStore';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import { OIMSingleSlotService } from './OIMSingleSlotService';

export class OIMWritableSingleSlotService<
    TSlot extends TOIMSlot, TContent,
    TSlotContentService extends IOIMSlotContentWriter<TSlot, TContent> & IOIMSlotContentService<TSlot> & IOIMSingleSlotCreator<TSlot>,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot> = OIMColumnSlotOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> extends OIMSingleSlotService<TSlot, TSlotContentService, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch> {
    public writeSingleSlotContent(
        storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>, content: TContent, changedSlots?: TSlot[],
    ): TSlot {
        const filed = this.slotStoreService.getSingleSlot(storeSlot.store);
        if (filed !== undefined) {
            if (this.slotContentService.writeSlotContent(filed, content) && changedSlots !== undefined) changedSlots.push(filed);
            return filed;
        }
        const slot = this.slotContentService.createSingleSlot(storeSlot as TOIMStoreSlot, this.slotOwnerService);
        this.slotContentService.insertSlotContent(slot, content, changedSlots);
        return slot;
    }

    public clearSingleSlotContent(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): void {
        const slot = this.slotStoreService.getSingleSlot(storeSlot.store);
        if (slot !== undefined) this.slotContentService.clearSlotContent(slot);
    }
}
