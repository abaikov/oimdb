import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { IOIMContentChangeListener } from '../../slot/interfaces/IOIMContentChangeListener';
import type { TOIMIndexStoreSlot } from '../types/TOIMIndexStoreSlot';
import { createOIMStoreSlot } from '../../slot/utils/createOIMStoreSlot';

export function createOIMIndexStoreSlot<
    TStore, TBucketSlot extends TOIMSlot, TBucketPatch, TSourceSlot extends TOIMSlot, TSourcePatch, TKey, TSourceStore,
>(
    store: TStore,
    sourceStoreSlot: TOIMStoreSlot<TSourceStore, TSourceSlot, TSourcePatch>,
    contentChangeListener: IOIMContentChangeListener<TSourceSlot, TSourcePatch>,
): TOIMIndexStoreSlot<TStore, TBucketSlot, TBucketPatch, TSourceSlot, TSourcePatch, TKey, TSourceStore> {
    return {
        ...createOIMStoreSlot<TStore, TBucketSlot, TBucketPatch>(store, sourceStoreSlot.channelSlot),
        sourceStoreSlot,
        indexKeysPosition: -1,
        contentChangeListener,
        requestedKeys: undefined,
        bucketColumnNames: new Set<string>(),
        isAnyBucketColumnRead: false,
        isDisposed: false,
    };
}
