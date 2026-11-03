import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { TOIMCollectionBucketSlot } from './types/TOIMCollectionBucketSlot';
import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMBucketSlotsSetStore } from './types/TOIMBucketSlotsSetStore';
import type { TOIMBucketSlotOwnerService } from './types/TOIMBucketSlotOwnerService';
import type { TOIMSlotCollectionStoreSlot } from './types/TOIMSlotCollectionStoreSlot';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import { OIMCollectionSetBucketContentService } from './OIMCollectionSetBucketContentService';
import { OIMSlotAtUnholdReleasePolicy } from '../collector/OIMSlotAtUnholdReleasePolicy';
import { OIMSingleSlotService } from '../slot/OIMSingleSlotService';
import { OIMSingleSlotStoreService } from '../store/OIMSingleSlotStoreService';
import { OIMDefaults } from '../db/OIMDefaults';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { resolveOIMSlotOwnerServiceOptions } from '../slot/utils/resolveOIMSlotOwnerServiceOptions';
import { isOIMSlotEmpty } from '../slot/utils/isOIMSlotEmpty';
import { isOIMSlotReleased } from '../slot/utils/isOIMSlotReleased';

type TBucketStoreSlot = ReturnType<OIMSlotCollectionBucketService['collectionBucketSingleSlotService']['createStoreSlot']>;

export class OIMSlotCollectionBucketService {
    public static readonly INSTANCE = new OIMSlotCollectionBucketService();

    private readonly collectionSetBucketContentService = new OIMCollectionSetBucketContentService();

    private readonly collectionBucketSingleSlotService = new OIMSingleSlotService<
        TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TOIMSlot>>, OIMCollectionSetBucketContentService, string, TOIMColumnSlot
    >({
        ...resolveOIMSlotOwnerServiceOptions(OIMDefaults.INSTANCE, { slotReleasePolicy: OIMSlotAtUnholdReleasePolicy.INSTANCE }),
        slotStoreService: OIMSingleSlotStoreService.INSTANCE as OIMSingleSlotStoreService<TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TOIMSlot>>>,
        slotContentService: this.collectionSetBucketContentService,
        storeSlotListener: OIMDefaults.INSTANCE.storeSlotListener ?? OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });

    public getBucketSlot<TSlot extends TOIMSlot>(storeSlot: TOIMSlotCollectionStoreSlot<TSlot>): TOIMCollectionBucketSlot<TSlot> {
        const collectionBucketSlot = storeSlot.collectionBucketSlot;
        if (collectionBucketSlot !== undefined && !isOIMSlotReleased(collectionBucketSlot)) return collectionBucketSlot;
        const bucketStoreSlot = this.getBucketStoreSlot(storeSlot, collectionBucketSlot);
        return this.fillCollectionBucketSlot(storeSlot, this.collectionBucketSingleSlotService.getSingleSlot(bucketStoreSlot));
    }

    public holdBucketSlot<TSlot extends TOIMSlot>(storeSlot: TOIMSlotCollectionStoreSlot<TSlot>): TOIMCollectionBucketSlot<TSlot> {
        const collectionBucketSlot = this.getBucketSlot(storeSlot);
        collectionBucketSlot.holdSlot();
        return collectionBucketSlot;
    }

    public getBucketColumnSlot<TSlot extends TOIMSlot>(storeSlot: TOIMSlotCollectionStoreSlot<TSlot>, columnName: string): TOIMColumnSlot {
        const collectionBucketSlot = this.getBucketSlot(storeSlot);
        this.collectionSetBucketContentService.addCollectionColumnRead(collectionBucketSlot as TOIMCollectionBucketSlot, columnName);
        return this.collectionBucketSingleSlotService.columnSlotService.getColumnSlot(collectionBucketSlot as unknown as TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TOIMSlot>>, columnName);
    }

    public holdBucketColumnSlot<TSlot extends TOIMSlot>(storeSlot: TOIMSlotCollectionStoreSlot<TSlot>, columnName: string): TOIMColumnSlot {
        const collectionBucketSlot = this.getBucketSlot(storeSlot);
        this.collectionSetBucketContentService.addCollectionColumnRead(collectionBucketSlot as TOIMCollectionBucketSlot, columnName);
        return this.collectionBucketSingleSlotService.columnSlotService.holdColumnSlot(collectionBucketSlot as unknown as TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TOIMSlot>>, columnName);
    }

    public getAnyBucketColumnSlot<TSlot extends TOIMSlot>(storeSlot: TOIMSlotCollectionStoreSlot<TSlot>): TOIMColumnSlot {
        const collectionBucketSlot = this.getBucketSlot(storeSlot);
        this.collectionSetBucketContentService.addCollectionAnyColumnRead(collectionBucketSlot as TOIMCollectionBucketSlot);
        return this.collectionBucketSingleSlotService.columnSlotService.getAnyColumnSlot(collectionBucketSlot as unknown as TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TOIMSlot>>);
    }

    public holdAnyBucketColumnSlot<TSlot extends TOIMSlot>(storeSlot: TOIMSlotCollectionStoreSlot<TSlot>): TOIMColumnSlot {
        const collectionBucketSlot = this.getBucketSlot(storeSlot);
        this.collectionSetBucketContentService.addCollectionAnyColumnRead(collectionBucketSlot as TOIMCollectionBucketSlot);
        return this.collectionBucketSingleSlotService.columnSlotService.holdAnyColumnSlot(collectionBucketSlot as unknown as TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TOIMSlot>>);
    }

    private getBucketStoreSlot(storeSlot: TOIMStoreSlot, releasedBucketSlot: TOIMCollectionBucketSlot | undefined): TBucketStoreSlot {
        if (releasedBucketSlot !== undefined) return releasedBucketSlot.storeSlot as unknown as TBucketStoreSlot;
        const bucketStoreSlot = this.collectionBucketSingleSlotService.createStoreSlot({ defaultChannelSlot: storeSlot.channelSlot });
        (bucketStoreSlot as TOIMEditable<TOIMStoreSlot>).sourceStoreSlot = storeSlot;
        return bucketStoreSlot;
    }

    private fillCollectionBucketSlot<TSlot extends TOIMSlot>(
        storeSlot: TOIMSlotCollectionStoreSlot<TSlot>, mintedBucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TOIMSlot>>,
    ): TOIMCollectionBucketSlot<TSlot> {
        const filledSlots: TSlot[] = [];
        for (const slot of storeSlot.slotService.getSlots(storeSlot)) if (!isOIMSlotEmpty(slot)) filledSlots.push(slot);
        this.collectionSetBucketContentService.fillBucketMemberSlots(mintedBucketSlot, filledSlots);
        (mintedBucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsSetStore<TOIMSlot>>).settleEmptiness(mintedBucketSlot, filledSlots.length === 0);
        const collectionBucketSlot = mintedBucketSlot as unknown as TOIMCollectionBucketSlot<TSlot>;
        (storeSlot as TOIMEditable<TOIMStoreSlot<unknown, TSlot>>).collectionBucketSlot = collectionBucketSlot;
        return collectionBucketSlot;
    }
}
