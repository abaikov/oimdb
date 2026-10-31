import type { OIMSingleSlotService } from './OIMSingleSlotService';
import type { TOIMSingleSlotStore } from '../store/types/TOIMSingleSlotStore';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';

export class OIMSingleSlotStoreAggregate<
    TSlot extends TOIMSlot, TPatch,
    TSlotService extends OIMSingleSlotService<TSlot, unknown>,
> {
    public constructor(
        public readonly slotService: TSlotService,
        public readonly storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch, TSlotService>,
    ) {}

    public get slotContentService(): TSlotService['slotContentService'] {
        return this.slotService.slotContentService;
    }

    public findSingleSlot(): TSlot | undefined {
        return this.slotService.findSingleSlot(this.storeSlot);
    }

    public hasSingleSlotContent(): boolean {
        return this.slotService.hasSingleSlotContent(this.storeSlot);
    }

    public getSingleSlot(): TSlot {
        return this.slotService.getSingleSlot(this.storeSlot);
    }

    public holdSingleSlot(): TSlot {
        return this.slotService.holdSingleSlot(this.storeSlot);
    }
}
