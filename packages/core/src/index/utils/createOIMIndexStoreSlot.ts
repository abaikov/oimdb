import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { IOIMSlotContentChangeListener } from '../../slot/interfaces/IOIMSlotContentChangeListener';
import type { TOIMIndexStoreSlot } from '../types/TOIMIndexStoreSlot';
import { createOIMStoreSlot } from '../../slot/utils/createOIMStoreSlot';

export function createOIMIndexStoreSlot<
    TStore, TBucketSlot extends TOIMSlot, TBucketPatch, TSourceSlot extends TOIMSlot, TSourcePatch, TKey, TSourceStore, TSlotService,
>(
    store: TStore,
    slotService: TSlotService,
    sourceStoreSlot: TOIMStoreSlot<TSourceStore, TSourceSlot, TSourcePatch>,
    contentChangeListener: IOIMSlotContentChangeListener<TSourceSlot, TSourcePatch>,
): TOIMIndexStoreSlot<TStore, TBucketSlot, TBucketPatch, TSourceSlot, TSourcePatch, TKey, TSourceStore, TSlotService> {
    return {
        ...createOIMStoreSlot<TStore, TBucketSlot, TBucketPatch, TSlotService>(store, sourceStoreSlot.channelSlot, slotService),
        sourceStoreSlot,
        indexKeysPosition: -1,
        contentChangeListener,
        requestedKeys: undefined,
        bucketColumnNames: new Set<string>(),
        isAnyBucketColumnRead: false,
        isDisposed: false,
    };
}
