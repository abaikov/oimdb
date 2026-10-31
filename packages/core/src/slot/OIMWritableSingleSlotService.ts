import type { IOIMSlotContentWriter } from './interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from './interfaces/IOIMSlotContentService';
import type { IOIMSingleSlotCreator } from './interfaces/IOIMSingleSlotCreator';
import type { OIMColumnSlotOwner } from '../column/OIMColumnSlotOwner';
import type { TOIMSingleSlotStore } from '../store/types/TOIMSingleSlotStore';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import { OIMSingleSlotService } from './OIMSingleSlotService';
import { OIMWritableSingleSlotStoreAggregate } from './OIMWritableSingleSlotStoreAggregate';

export class OIMWritableSingleSlotService<
    TSlot extends TOIMSlot, TContent,
    TSlotContentService extends IOIMSlotContentWriter<TSlot, TContent> & IOIMSlotContentService<TSlot> & IOIMSingleSlotCreator<TSlot>,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot> = OIMColumnSlotOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> extends OIMSingleSlotService<TSlot, TSlotContentService, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch> {
    public override createStoreAggregate(
        storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch, this>,
    ): OIMWritableSingleSlotStoreAggregate<TSlot, TContent, TPatch, this> {
        return new OIMWritableSingleSlotStoreAggregate(this, storeSlot);
    }

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
