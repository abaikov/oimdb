import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { IOIMStoreSlotListener } from '../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { IOIMKeyedSlotCreator } from '../../engine/slot/interfaces/IOIMKeyedSlotCreator';
import { OIMSlotOwnerService } from '../../engine/slot/OIMSlotOwnerService';
import type { OIMColumnSlotOwner } from '../../engine/column/OIMColumnSlotOwner';
import type { IOIMChannelMap } from '../../engine/channel/interfaces/IOIMChannelMap';
import type { IOIMSlotOwner } from '../../engine/slot/interfaces/IOIMSlotOwner';
import { OIMUnusedSlotCollectorService } from '../../engine/collector/OIMUnusedSlotCollectorService';
import { OIMContentChangeDeliveryService } from '../../engine/slot/OIMContentChangeDeliveryService';
import { OIMColumnSlotService } from '../column/OIMColumnSlotService';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { TOIMSlotCollectionServiceOptions } from './types/TOIMSlotCollectionServiceOptions';
import { createOIMStoreSlot } from '../../engine/slot/utils/createOIMStoreSlot';
import { oimIsSlotEmpty } from '../../engine/slot/utils/oimIsSlotEmpty';

export class OIMSlotCollectionService<
    TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TStore, TSlotContentService,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot> = OIMColumnSlotOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> {
    public readonly slotContentService: TSlotContentService;

    public readonly columnSlotService: OIMColumnSlotService<TSlot, TColumnName, TColumnSlot, TColumnSlotOwner>;

    protected readonly slotOwnerService: OIMSlotOwnerService<TSlot, TStore, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch>;

    protected readonly slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore>;

    protected readonly keyedSlotCreator: IOIMKeyedSlotCreator<TKey, TSlot>;

    private readonly storeSlotListener: IOIMStoreSlotListener | undefined;

    public constructor(
        options: TOIMSlotCollectionServiceOptions<TKey, TSlot, TStore, TSlotContentService, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch>,
    ) {
        const slotOwnerService = new OIMSlotOwnerService<TSlot, TStore, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch>({ ...options, slotFilingService: options.slotStoreService });
        this.slotOwnerService = slotOwnerService;
        this.columnSlotService = new OIMColumnSlotService<TSlot, TColumnName, TColumnSlot, TColumnSlotOwner>(slotOwnerService.columnSlotOwner);
        this.slotStoreService = options.slotStoreService;
        this.keyedSlotCreator = options.slotContentService;
        this.slotContentService = options.slotContentService;
        this.storeSlotListener = options.storeSlotListener;
    }

    public get slotOwner(): IOIMSlotOwner {
        return this.slotOwnerService;
    }

    public createStoreSlot(channelMap: IOIMChannelMap): TOIMStoreSlot<TStore, TSlot, TPatch, this> {
        const channelSlot = channelMap.defaultChannelSlot;
        return this.createStoreSlotWith(store => createOIMStoreSlot<TStore, TSlot, TPatch, this>(store, channelSlot, this));
    }

    public createStoreSlotFrom(sourceStoreSlot: TOIMStoreSlot): TOIMStoreSlot<TStore, TSlot, TPatch, this> {
        return this.createStoreSlotWith(store => createOIMStoreSlot<TStore, TSlot, TPatch, this>(
            store, sourceStoreSlot.channelSlot, this, sourceStoreSlot,
        ));
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

    public openBatch(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>): void {
        OIMContentChangeDeliveryService.INSTANCE.openBatch(storeSlot as TOIMStoreSlot);
    }

    public closeBatch(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>): void {
        OIMContentChangeDeliveryService.INSTANCE.closeBatch(storeSlot as TOIMStoreSlot);
    }

    public writeInBatch<TResult>(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, write: () => TResult): TResult {
        const contentChangeDeliveryService = OIMContentChangeDeliveryService.INSTANCE;
        contentChangeDeliveryService.openBatch(storeSlot as TOIMStoreSlot);
        try {
            return write();
        } finally {
            contentChangeDeliveryService.closeBatch(storeSlot as TOIMStoreSlot);
        }
    }

    protected onSlotMinted(_storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, _slot: TSlot): void { return; }

    private mintSlotByKey(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, key: TKey): TSlot {
        const slotOwnerService = this.slotOwnerService;
        const slot = this.keyedSlotCreator.createSlot(this.slotStoreService.ownKey(key), storeSlot as TOIMStoreSlot, slotOwnerService);
        this.onSlotMinted(storeSlot, slot);
        slotOwnerService.settleEmptiness(slot, slotOwnerService.isSlotEmpty(slot));
        slotOwnerService.fileSlot(slot);
        return slot;
    }
}
