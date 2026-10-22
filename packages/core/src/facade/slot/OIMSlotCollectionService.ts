import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { IOIMStoreSlotListener } from '../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { OIMSlotOwnerService } from '../../engine/slot/OIMSlotOwnerService';
import type { OIMColumnOwner } from '../../engine/column/OIMColumnOwner';
import type { IOIMChannelMap } from '../../engine/channel/interfaces/IOIMChannelMap';
import { OIMUnusedSlotCollectorService } from '../../engine/collector/OIMUnusedSlotCollectorService';
import { OIMSlotColumnService } from './OIMSlotColumnService';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { TOIMSlotCollectionServiceOptions } from './types/TOIMSlotCollectionServiceOptions';
import { createOIMStoreSlot } from '../../engine/slot/utils/createOIMStoreSlot';
import { oimIsSlotEmpty } from '../../engine/slot/utils/oimIsSlotEmpty';

export class OIMSlotCollectionService<
    TKey, TSlot extends TOIMKeyedSlot<TKey>, TStore, TSlotContentService,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnOwner extends OIMColumnOwner<TOIMSlot, TColumnSlot> = OIMColumnOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> extends OIMSlotColumnService<TSlot, TColumnName, TColumnSlot, TColumnOwner> {
    public readonly slotContentService: TSlotContentService;

    protected readonly slotOwnerService: OIMSlotOwnerService<TKey, TSlot, TStore, TColumnName, TColumnSlot, TColumnOwner, TPatch>;

    private readonly slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore>;

    private readonly storeSlotListener: IOIMStoreSlotListener | undefined;

    public constructor(
        options: TOIMSlotCollectionServiceOptions<TKey, TSlot, TStore, TSlotContentService, TColumnName, TColumnSlot, TColumnOwner, TPatch>,
    ) {
        super(options.slotOwnerService.columnOwner);
        this.slotOwnerService = options.slotOwnerService;
        this.slotStoreService = options.slotStoreService;
        this.slotContentService = options.slotContentService;
        this.storeSlotListener = options.storeSlotListener;
    }

    public createStoreSlot(channelMap: IOIMChannelMap): TOIMStoreSlot<TStore, TSlot, TPatch> {
        const channelSlot = channelMap.defaultChannelSlot;
        return this.createStoreSlotWith(store => createOIMStoreSlot<TStore, TSlot, TPatch>(store, channelSlot));
    }

    public createStoreSlotFrom(sourceStoreSlot: TOIMStoreSlot): TOIMStoreSlot<TStore, TSlot, TPatch> {
        return this.createStoreSlotWith(store => createOIMStoreSlot<TStore, TSlot, TPatch>(store, sourceStoreSlot.channelSlot, sourceStoreSlot));
    }

    protected createStoreSlotWith<TStoreSlot extends TOIMStoreSlot<TStore, TSlot, TPatch>>(
        createStoreSlotLiteral: (store: TStore) => TStoreSlot,
    ): TStoreSlot {
        const storeSlot = createStoreSlotLiteral(this.slotStoreService.createStore());
        if (this.storeSlotListener !== undefined) this.storeSlotListener.onStoreSlotCreated(storeSlot);
        return storeSlot;
    }

    public findSlotByKey(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, key: TKey): TSlot | undefined {
        return this.slotStoreService.get(storeSlot.store, key);
    }

    public hasSlotContentByKey(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, key: TKey): boolean {
        const slot = this.slotStoreService.get(storeSlot.store, key);
        return slot !== undefined && !oimIsSlotEmpty(slot);
    }

    public getSlotByKey(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, key: TKey): TSlot {
        const found = this.slotStoreService.get(storeSlot.store, key);
        if (found !== undefined) return found;
        const slot = this.mintSlotByKey(storeSlot, key);
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(storeSlot.channelSlot.collectorSlot.unusedSlotCollectorSlot, slot);
        return slot;
    }

    public holdSlotByKey(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, key: TKey): TSlot {
        const slot = this.slotStoreService.get(storeSlot.store, key) ?? this.mintSlotByKey(storeSlot, key);
        this.slotOwnerService.holdSlot(slot);
        return slot;
    }

    public getSlots(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>): IterableIterator<TSlot> {
        return this.slotStoreService.getSlots(storeSlot.store);
    }

    public getSlotCount(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>): number {
        return this.slotStoreService.getSlotCount(storeSlot.store);
    }

    public isSameKey(key: TKey, otherKey: TKey): boolean {
        return this.slotStoreService.isSameKey(key, otherKey);
    }

    protected onSlotMinted(_storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, _slot: TSlot): void { return; }

    private mintSlotByKey(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, key: TKey): TSlot {
        const slotOwnerService = this.slotOwnerService;
        const slot = slotOwnerService.createSlot(this.slotStoreService.ownKey(key), storeSlot as TOIMStoreSlot);
        this.onSlotMinted(storeSlot, slot);
        slotOwnerService.settleEmptiness(slot, slotOwnerService.isSlotEmpty(slot));
        slotOwnerService.fileSlot(storeSlot as TOIMStoreSlot<TStore, TSlot>, slot);
        return slot;
    }
}
