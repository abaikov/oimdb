import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { IOIMStoreSlotListener } from './interfaces/IOIMStoreSlotListener';
import type { IOIMKeyedSlotCreator } from './interfaces/IOIMKeyedSlotCreator';
import { OIMSlotOwnerService } from './OIMSlotOwnerService';
import type { OIMColumnSlotOwner } from '../column/OIMColumnSlotOwner';
import type { TOIMChannelSlot } from '../channel/types/TOIMChannelSlot';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import type { OIMColumnSlotService } from '../column/OIMColumnSlotService';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import type { TOIMSlotCollectionServiceOptions } from './types/TOIMSlotCollectionServiceOptions';
import { createOIMStoreSlot } from './utils/createOIMStoreSlot';
import { oimIsSlotEmpty } from './utils/oimIsSlotEmpty';

export abstract class OIMSlotCollectionService<
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
        options: TOIMSlotCollectionServiceOptions<TKey, TSlot, TStore, TSlotContentService, TColumnName, TColumnSlot, TColumnSlotOwner>,
    ) {
        const slotOwnerService = new OIMSlotOwnerService<TSlot, TStore, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch>({ ...options, slotFilingService: options.slotStoreService });
        this.slotOwnerService = slotOwnerService;
        this.columnSlotService = slotOwnerService.columnSlotService;
        this.slotStoreService = options.slotStoreService;
        this.keyedSlotCreator = options.slotContentService;
        this.slotContentService = options.slotContentService;
        this.storeSlotListener = options.storeSlotListener;
    }

    protected createStoreSlotOnChannel(channelSlot: TOIMChannelSlot, sourceStoreSlot?: TOIMStoreSlot): TOIMStoreSlot<TStore, TSlot, TPatch, this> {
        return this.createStoreSlotOverNewStore(store => createOIMStoreSlot<TStore, TSlot, TPatch, this>(store, channelSlot, this, sourceStoreSlot));
    }

    protected createStoreSlotOverNewStore<TStoreSlot extends TOIMStoreSlot<TStore, TSlot, TPatch>>(
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
        const slot = this.mintEmptySlotByKey(storeSlot, key);
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(storeSlot.channelSlot.collectorSlot.unusedSlotCollectorSlot, slot);
        return slot;
    }

    public holdSlotByKey(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, key: TKey): TSlot {
        const slot = this.slotStoreService.get(storeSlot.store, key) ?? this.mintEmptySlotByKey(storeSlot, key);
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

    protected mintSlotByKey(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, key: TKey): TSlot {
        const slot = this.keyedSlotCreator.createSlot(this.slotStoreService.ownKey(key), storeSlot as TOIMStoreSlot, this.slotOwnerService);
        this.onSlotMinted(storeSlot, slot);
        this.slotOwnerService.fileSlot(slot);
        return slot;
    }

    private mintEmptySlotByKey(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>, key: TKey): TSlot {
        const slotOwnerService = this.slotOwnerService;
        const slot = this.mintSlotByKey(storeSlot, key);
        slotOwnerService.settleEmptiness(slot, slotOwnerService.isSlotEmpty(slot));
        return slot;
    }
}
