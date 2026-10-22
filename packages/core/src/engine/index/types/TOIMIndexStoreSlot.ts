import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { IOIMContentChangeListener } from '../../slot/interfaces/IOIMContentChangeListener';

export type TOIMIndexStoreSlot<
    TStore = unknown, TBucketSlot extends TOIMSlot = TOIMSlot, TBucketPatch = unknown,
    TSourceSlot extends TOIMSlot = TOIMSlot, TSourcePatch = unknown, TKey = unknown, TSourceStore = unknown,
> = TOIMStoreSlot<TStore, TBucketSlot, TBucketPatch> & {
    readonly sourceStoreSlot: TOIMStoreSlot<TSourceStore, TSourceSlot, TSourcePatch>;
    readonly indexKeysPosition: number;
    readonly contentChangeListener: IOIMContentChangeListener<TSourceSlot, TSourcePatch>;
    readonly requestedKeys: readonly TKey[] | undefined;
    readonly bucketColumnNames: Set<string>;
    readonly isAnyBucketColumnRead: boolean;
    readonly isDisposed: boolean;
};
