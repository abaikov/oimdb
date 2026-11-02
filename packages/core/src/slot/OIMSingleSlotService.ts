import type { IOIMStoreSlotListener } from './interfaces/IOIMStoreSlotListener';
import type { IOIMSingleSlotCreator } from './interfaces/IOIMSingleSlotCreator';
import { OIMSlotOwnerService } from './OIMSlotOwnerService';
import type { OIMSingleSlotStoreService } from '../store/OIMSingleSlotStoreService';
import type { OIMColumnSlotOwner } from '../column/OIMColumnSlotOwner';
import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import type { OIMColumnSlotService } from '../column/OIMColumnSlotService';
import type { TOIMSingleSlotStore } from '../store/types/TOIMSingleSlotStore';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import type { TOIMSingleSlotServiceOptions } from './types/TOIMSingleSlotServiceOptions';
import { createOIMStoreSlot } from './utils/createOIMStoreSlot';
import { oimIsSlotEmpty } from './utils/oimIsSlotEmpty';
import { OIMSingleSlotStoreAggregate } from './OIMSingleSlotStoreAggregate';

export class OIMSingleSlotService<
    TSlot extends TOIMSlot, TSlotContentService,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot> = OIMColumnSlotOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> {
    public readonly slotContentService: TSlotContentService;

    public readonly columnSlotService: OIMColumnSlotService<TSlot, TColumnName, TColumnSlot, TColumnSlotOwner>;

    protected readonly slotOwnerService: OIMSlotOwnerService<
        TSlot, TOIMSingleSlotStore<TSlot>, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch
    >;

    protected readonly slotStoreService: OIMSingleSlotStoreService<TSlot>;

    protected readonly singleSlotCreator: IOIMSingleSlotCreator<TSlot>;

    private readonly storeSlotListener: IOIMStoreSlotListener | undefined;

    public constructor(
        options: TOIMSingleSlotServiceOptions<TSlot, TSlotContentService, TColumnName, TColumnSlot, TColumnSlotOwner>,
    ) {
        const slotOwnerService = new OIMSlotOwnerService<
            TSlot, TOIMSingleSlotStore<TSlot>, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch
        >({ ...options, slotFilingService: options.slotStoreService });
        this.slotOwnerService = slotOwnerService;
        this.columnSlotService = slotOwnerService.columnSlotService;
        this.slotStoreService = options.slotStoreService;
        this.singleSlotCreator = options.slotContentService;
        this.slotContentService = options.slotContentService;
        this.storeSlotListener = options.storeSlotListener;
    }

    public createStoreSlot(channelMap: IOIMChannelMap): TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch, this> {
        const storeSlot = createOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch, this>(
            this.slotStoreService.createStore(), channelMap.defaultChannelSlot, this,
        );
        if (this.storeSlotListener !== undefined) this.storeSlotListener.onStoreSlotCreated(storeSlot);
        return storeSlot;
    }

    public createStoreAggregate(
        storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch, this>,
    ): OIMSingleSlotStoreAggregate<TSlot, TPatch, this> {
        return new OIMSingleSlotStoreAggregate(this, storeSlot);
    }

    public findSingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot | undefined {
        return this.slotStoreService.getSingleSlot(storeSlot.store);
    }

    public hasSingleSlotContent(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): boolean {
        const slot = this.slotStoreService.getSingleSlot(storeSlot.store);
        return slot !== undefined && !oimIsSlotEmpty(slot);
    }

    public getSingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot {
        const found = this.slotStoreService.getSingleSlot(storeSlot.store);
        if (found !== undefined) return found;
        const slot = this.mintEmptySingleSlot(storeSlot);
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(storeSlot.channelSlot.collectorSlot.unusedSlotCollectorSlot, slot);
        return slot;
    }

    public holdSingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot {
        const slot = this.slotStoreService.getSingleSlot(storeSlot.store) ?? this.mintEmptySingleSlot(storeSlot);
        this.slotOwnerService.holdSlot(slot);
        return slot;
    }

    protected mintSingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot {
        const slot = this.singleSlotCreator.createSingleSlot(storeSlot as TOIMStoreSlot, this.slotOwnerService);
        this.slotOwnerService.fileSlot(slot);
        return slot;
    }

    private mintEmptySingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot {
        const slotOwnerService = this.slotOwnerService;
        const slot = this.mintSingleSlot(storeSlot);
        slotOwnerService.settleEmptiness(slot, slotOwnerService.isSlotEmpty(slot));
        return slot;
    }
}
