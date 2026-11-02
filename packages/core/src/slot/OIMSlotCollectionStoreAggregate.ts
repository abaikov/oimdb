import type { OIMSlotCollectionService } from './OIMSlotCollectionService';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';

export class OIMSlotCollectionStoreAggregate<
    TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TStore, TPatch,
    TSlotService extends OIMSlotCollectionService<TKey, TSlot, TStore, unknown>,
> {
    public constructor(
        public readonly slotService: TSlotService,
        public readonly storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch, TSlotService>,
    ) {}

    public get slotContentService(): TSlotService['slotContentService'] {
        return this.slotService.slotContentService;
    }

    public findSlotByKey(key: TKey): TSlot | undefined {
        return this.slotService.findSlotByKey(this.storeSlot, key);
    }

    public hasSlotContentByKey(key: TKey): boolean {
        return this.slotService.hasSlotContentByKey(this.storeSlot, key);
    }

    public getSlotByKey(key: TKey): TSlot {
        return this.slotService.getSlotByKey(this.storeSlot, key);
    }

    public holdSlotByKey(key: TKey): TSlot {
        return this.slotService.holdSlotByKey(this.storeSlot, key);
    }

    public getSlots(): IterableIterator<TSlot> {
        return this.slotService.getSlots(this.storeSlot);
    }

    public getSlotCount(): number {
        return this.slotService.getSlotCount(this.storeSlot);
    }
}
