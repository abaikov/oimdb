import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMBucketSlotsSetStore } from './types/TOIMBucketSlotsSetStore';
import type { TOIMBucketSlotOwnerService } from './types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { TOIMCollectionBucketSlot } from './types/TOIMCollectionBucketSlot';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { IOIMSlotContentService } from '../slot/interfaces/IOIMSlotContentService';
import type { IOIMSingleSlotCreator } from '../slot/interfaces/IOIMSingleSlotCreator';
import type { IOIMSlotContentChangeListener } from '../slot/interfaces/IOIMSlotContentChangeListener';
import { OIMBucketMemberSlotsSetService } from './set/OIMBucketMemberSlotsSetService';
import { OIMSlotContentChangeListenerService } from '../slot/OIMSlotContentChangeListenerService';
import { createOIMBucketContentSlot } from './utils/createOIMBucketContentSlot';
import { oimMarkBucketColumnsChanged } from './utils/oimMarkBucketColumnsChanged';
import { oimIsSlotReleased } from '../slot/utils/oimIsSlotReleased';
import { oimIsAnyAddedColumnRead } from '../slot/utils/oimIsAnyAddedColumnRead';
import { oimAssertSlotUnheld } from '../slot/utils/oimAssertSlotUnheld';
import { OIM_NOTHING_WAS_REMOVED } from './constants/OIM_NOTHING_WAS_REMOVED';
import { oimGetBucketSlotsSetStore } from './utils/oimGetBucketSlotsSetStore';

export class OIMCollectionSetBucketContentService<TBucketMemberSlot extends TOIMSlot = TOIMSlot>
implements IOIMSlotContentService<TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>>, IOIMSingleSlotCreator<TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>> {
    private readonly bucketMemberSlotsSetService = OIMBucketMemberSlotsSetService.INSTANCE as OIMBucketMemberSlotsSetService<TBucketMemberSlot>;

    public createSingleSlot(storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>> {
        return createOIMBucketContentSlot(
            slotOwner, this.bucketMemberSlotsSetService.createBucketSlotsSetStore(),
            storeSlot as TOIMStoreSlot<unknown, TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>>,
        );
    }

    public isSlotEmpty(collectionBucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>): boolean {
        return this.bucketMemberSlotsSetService.getBucketMemberSlotCount(oimGetBucketSlotsSetStore(collectionBucketSlot)) === 0;
    }

    public hasBucketMemberSlot(collectionBucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return this.bucketMemberSlotsSetService.hasBucketMemberSlot(oimGetBucketSlotsSetStore(collectionBucketSlot), bucketMemberSlot);
    }

    public getBucketMemberSlotCount(collectionBucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>): number {
        return this.bucketMemberSlotsSetService.getBucketMemberSlotCount(oimGetBucketSlotsSetStore(collectionBucketSlot));
    }

    public getBucketMemberSlots(collectionBucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>): Iterable<TBucketMemberSlot> {
        return this.bucketMemberSlotsSetService.getBucketMemberSlots(oimGetBucketSlotsSetStore(collectionBucketSlot));
    }

    public fillBucketMemberSlots(collectionBucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[]): void {
        const bucketSlotsSetStore = oimGetBucketSlotsSetStore(collectionBucketSlot);
        for (let i = 0; i < bucketMemberSlots.length; i++) this.bucketMemberSlotsSetService.addBucketMemberSlot(bucketSlotsSetStore, bucketMemberSlots[i]);
    }

    public releaseSlotContent(collectionBucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>): void {
        oimAssertSlotUnheld(collectionBucketSlot);
        this.bucketMemberSlotsSetService.clearBucketMemberSlots(oimGetBucketSlotsSetStore(collectionBucketSlot));
        const bucketStoreSlot = collectionBucketSlot.storeSlot as TOIMEditable<TOIMStoreSlot>;
        const collectionColumnListener = bucketStoreSlot.contentChangeListener as IOIMSlotContentChangeListener<TBucketMemberSlot, unknown> | undefined;
        if (collectionColumnListener === undefined) return;
        OIMSlotContentChangeListenerService.INSTANCE.removeContentChangeListener(bucketStoreSlot.sourceStoreSlot as TOIMStoreSlot, collectionColumnListener);
        bucketStoreSlot.contentChangeListener = undefined;
        bucketStoreSlot.slotContentChangeListenerReadColumns = undefined;
    }

    public onCollectionSlotFilled(collectionBucketSlot: TOIMCollectionBucketSlot<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): void {
        const bucketContentSlot = collectionBucketSlot as unknown as TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>;
        if (!this.bucketMemberSlotsSetService.addBucketMemberSlot(oimGetBucketSlotsSetStore(bucketContentSlot), bucketMemberSlot)) return;
        ownerOf(bucketContentSlot).markSlotContentChanged(bucketContentSlot, this.isSlotEmpty(bucketContentSlot));
    }

    public onCollectionSlotEmptied(collectionBucketSlot: TOIMCollectionBucketSlot<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): void {
        const bucketContentSlot = collectionBucketSlot as unknown as TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>;
        if (this.bucketMemberSlotsSetService.removeBucketMemberSlot(oimGetBucketSlotsSetStore(bucketContentSlot), bucketMemberSlot) === OIM_NOTHING_WAS_REMOVED) return;
        ownerOf(bucketContentSlot).markSlotContentChanged(bucketContentSlot, this.isSlotEmpty(bucketContentSlot));
    }

    public addCollectionColumnRead(collectionBucketSlot: TOIMCollectionBucketSlot<TBucketMemberSlot>, columnName: string): void {
        const bucketStoreSlot = collectionBucketSlot.storeSlot;
        OIMSlotContentChangeListenerService.INSTANCE.addListenerReadColumn(
            bucketStoreSlot.sourceStoreSlot as TOIMStoreSlot, this.getCollectionColumnListener(bucketStoreSlot), columnName,
        );
    }

    public addCollectionAnyColumnRead(collectionBucketSlot: TOIMCollectionBucketSlot<TBucketMemberSlot>): void {
        const bucketStoreSlot = collectionBucketSlot.storeSlot;
        OIMSlotContentChangeListenerService.INSTANCE.addListenerReadAnyColumn(
            bucketStoreSlot.sourceStoreSlot as TOIMStoreSlot, this.getCollectionColumnListener(bucketStoreSlot),
        );
    }

    private getCollectionColumnListener(bucketStoreSlot: TOIMStoreSlot): IOIMSlotContentChangeListener<TOIMSlot, unknown> {
        const filedListener = bucketStoreSlot.contentChangeListener as IOIMSlotContentChangeListener<TOIMSlot, unknown> | undefined;
        if (filedListener !== undefined) return filedListener;
        const collectionStoreSlot = bucketStoreSlot.sourceStoreSlot as TOIMStoreSlot;
        const collectionColumnListener: IOIMSlotContentChangeListener<TOIMSlot, unknown> = {
            onContentChanged: (bucketMemberSlot, patch, changedColumns) => {
                this.markCollectionMemberColumnsChanged(bucketStoreSlot, bucketMemberSlot as TBucketMemberSlot, patch, changedColumns);
            },
            onManyContentsChanged: (bucketMemberSlotChannelQueue, patchChannelQueue, changedColumnsChannelQueue) => {
                const changeCount = bucketMemberSlotChannelQueue.getEntryCount();
                for (let i = 0; i < changeCount; i++) {
                    this.markCollectionMemberColumnsChanged(
                        bucketStoreSlot, bucketMemberSlotChannelQueue.getEntryAt(i) as TBucketMemberSlot,
                        patchChannelQueue.getEntryAt(i), changedColumnsChannelQueue.getEntryAt(i),
                    );
                }
            },
        };
        const editableBucketStoreSlot = bucketStoreSlot as TOIMEditable<TOIMStoreSlot>;
        editableBucketStoreSlot.contentChangeListener = collectionColumnListener;
        editableBucketStoreSlot.slotContentChangeListenerReadColumns = OIMSlotContentChangeListenerService.INSTANCE
            .addContentChangeListener(collectionStoreSlot, collectionColumnListener, []);
        return collectionColumnListener;
    }

    private markCollectionMemberColumnsChanged(
        bucketStoreSlot: TOIMStoreSlot, bucketMemberSlot: TBucketMemberSlot, patch: unknown, changedColumns: readonly string[] | undefined,
    ): void {
        const listenerReadColumns = bucketStoreSlot.slotContentChangeListenerReadColumns;
        if (listenerReadColumns === undefined || !oimIsAnyAddedColumnRead(listenerReadColumns, changedColumns)) return;
        const collectionBucketSlot = (bucketStoreSlot.sourceStoreSlot as TOIMStoreSlot).collectionBucketSlot as unknown as
            TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>> | undefined;
        if (collectionBucketSlot === undefined || oimIsSlotReleased(collectionBucketSlot)) return;
        if (!this.bucketMemberSlotsSetService.hasBucketMemberSlot(oimGetBucketSlotsSetStore(collectionBucketSlot), bucketMemberSlot)) return;
        oimMarkBucketColumnsChanged(collectionBucketSlot, patch as object | undefined, changedColumns);
    }
}


function ownerOf<TBucketMemberSlot extends TOIMSlot>(
    collectionBucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>,
): TOIMBucketSlotOwnerService<TOIMBucketSlotsSetStore<TBucketMemberSlot>> {
    return collectionBucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsSetStore<TBucketMemberSlot>>;
}
