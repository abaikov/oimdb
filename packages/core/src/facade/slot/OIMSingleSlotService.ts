import type { IOIMStoreSlotListener } from '../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { OIMSlotOwnerService } from '../../engine/slot/OIMSlotOwnerService';
import type { OIMSlotStoreServiceSingleSlotDriven } from '../../engine/store/OIMSlotStoreServiceSingleSlotDriven';
import type { OIMColumnOwner } from '../../engine/column/OIMColumnOwner';
import type { IOIMChannelMap } from '../../engine/channel/interfaces/IOIMChannelMap';
import { OIMUnusedSlotCollectorService } from '../../engine/collector/OIMUnusedSlotCollectorService';
import { OIMSlotColumnService } from './OIMSlotColumnService';
import type { TOIMSingleSlotStore } from '../../engine/store/types/TOIMSingleSlotStore';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { TOIMSingleSlotServiceOptions } from './types/TOIMSingleSlotServiceOptions';
import { createOIMStoreSlot } from '../../engine/slot/utils/createOIMStoreSlot';
import { oimIsSlotEmpty } from '../../engine/slot/utils/oimIsSlotEmpty';

export class OIMSingleSlotService<
    TSlot extends TOIMKeyedSlot<void>, TSlotContentService,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnOwner extends OIMColumnOwner<TOIMSlot, TColumnSlot> = OIMColumnOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> extends OIMSlotColumnService<TSlot, TColumnName, TColumnSlot, TColumnOwner> {
    public readonly slotContentService: TSlotContentService;

    protected readonly slotOwnerService: OIMSlotOwnerService<
        void, TSlot, TOIMSingleSlotStore<TSlot>, TColumnName, TColumnSlot, TColumnOwner, TPatch
    >;

    private readonly slotStoreService: OIMSlotStoreServiceSingleSlotDriven<TSlot>;

    private readonly storeSlotListener: IOIMStoreSlotListener | undefined;

    public constructor(
        options: TOIMSingleSlotServiceOptions<TSlot, TSlotContentService, TColumnName, TColumnSlot, TColumnOwner, TPatch>,
    ) {
        super(options.slotOwnerService.columnOwner);
        this.slotOwnerService = options.slotOwnerService;
        this.slotStoreService = options.slotStoreService;
        this.slotContentService = options.slotContentService;
        this.storeSlotListener = options.storeSlotListener;
    }

    public createStoreSlot(channelMap: IOIMChannelMap): TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch> {
        const storeSlot = createOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>(
            this.slotStoreService.createStore(), channelMap.defaultChannelSlot,
        );
        if (this.storeSlotListener !== undefined) this.storeSlotListener.onStoreSlotCreated(storeSlot);
        return storeSlot;
    }

    public findSingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot | undefined {
        return this.slotStoreService.get(storeSlot.store);
    }

    public hasSingleSlotContent(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): boolean {
        const slot = this.slotStoreService.get(storeSlot.store);
        return slot !== undefined && !oimIsSlotEmpty(slot);
    }

    public getSingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot {
        const found = this.slotStoreService.get(storeSlot.store);
        if (found !== undefined) return found;
        const slot = this.mintSingleSlot(storeSlot);
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(storeSlot.channelSlot.collectorSlot.unusedSlotCollectorSlot, slot);
        return slot;
    }

    public holdSingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot {
        const slot = this.slotStoreService.get(storeSlot.store) ?? this.mintSingleSlot(storeSlot);
        this.slotOwnerService.holdSlot(slot);
        return slot;
    }

    private mintSingleSlot(storeSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>): TSlot {
        const slotOwnerService = this.slotOwnerService;
        const slot = slotOwnerService.createSlot(undefined, storeSlot as TOIMStoreSlot);
        slotOwnerService.settleEmptiness(slot, slotOwnerService.isSlotEmpty(slot));
        slotOwnerService.fileSlot(storeSlot as TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot>, slot);
        return slot;
    }
}
