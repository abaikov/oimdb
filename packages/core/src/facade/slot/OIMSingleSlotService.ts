import type { IOIMStoreSlotListener } from '../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { IOIMSingleSlotCreator } from '../../engine/slot/interfaces/IOIMSingleSlotCreator';
import type { IOIMSlotOwner } from '../../engine/slot/interfaces/IOIMSlotOwner';
import { OIMSlotOwnerService } from '../../engine/slot/OIMSlotOwnerService';
import type { OIMSingleSlotStoreService } from '../../engine/store/OIMSingleSlotStoreService';
import type { OIMColumnSlotOwner } from '../../engine/column/OIMColumnSlotOwner';
import type { IOIMChannelMap } from '../../engine/channel/interfaces/IOIMChannelMap';
import { OIMUnusedSlotCollectorService } from '../../engine/collector/OIMUnusedSlotCollectorService';
import { OIMColumnSlotService } from '../column/OIMColumnSlotService';
import type { TOIMSingleSlotStore } from '../../engine/store/types/TOIMSingleSlotStore';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { TOIMSingleSlotServiceOptions } from './types/TOIMSingleSlotServiceOptions';
import { createOIMStoreSlot } from '../../engine/slot/utils/createOIMStoreSlot';
import { oimIsSlotEmpty } from '../../engine/slot/utils/oimIsSlotEmpty';

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
        options: TOIMSingleSlotServiceOptions<TSlot, TSlotContentService, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch>,
    ) {
        const slotOwnerService = new OIMSlotOwnerService<
            TSlot, TOIMSingleSlotStore<TSlot>, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch
        >({ ...options, slotFilingService: options.slotStoreService });
        this.slotOwnerService = slotOwnerService;
        this.columnSlotService = new OIMColumnSlotService<TSlot, TColumnName, TColumnSlot, TColumnSlotOwner>(slotOwnerService.columnSlotOwner);
        this.slotStoreService = options.slotStoreService;
        this.singleSlotCreator = options.slotContentService;
        this.slotContentService = options.slotContentService;
        this.storeSlotListener = options.storeSlotListener;
    }

    public get slotOwner(): IOIMSlotOwner {
        return this.slotOwnerService;
    }

    public createStoreSlot(channelMap: IOIMChannelMap): TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch, this> {
        const storeSlot = createOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch, this>(
            this.slotStoreService.createStore(), channelMap.defaultChannelSlot, this,
        );
        if (this.storeSlotListener !== undefined) this.storeSlotListener.onStoreSlotCreated(storeSlot);
        return storeSlot;
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
        const slot = this.mintSingleSlot(storeSlot);
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(storeSlot.channelSlot.collectorSlot.unusedSlotCollectorSlot, slot);
        return slot;
    }

    public holdSingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot {
        const slot = this.slotStoreService.getSingleSlot(storeSlot.store) ?? this.mintSingleSlot(storeSlot);
        this.slotOwnerService.holdSlot(slot);
        return slot;
    }

    private mintSingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot {
        const slotOwnerService = this.slotOwnerService;
        const slot = this.singleSlotCreator.createSingleSlot(storeSlot as TOIMStoreSlot, slotOwnerService);
        slotOwnerService.settleEmptiness(slot, slotOwnerService.isSlotEmpty(slot));
        slotOwnerService.fileSlot(slot);
        return slot;
    }
}
