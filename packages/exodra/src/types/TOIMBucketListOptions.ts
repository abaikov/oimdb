import type { TExoMachine } from '@exodra/core';
import type { TExoChildList } from '@exodra/dom';
import type { OIMDB, TOIMBucketContentSlot, TOIMBucketSlotsArrayStore, TOIMSlot } from '@oimdb/core';

export type TOIMBucketListOptions<TNode, TWiring, TBucketMemberSlot extends TOIMSlot> = {
    readonly selectChildList: (c: TNode) => TExoChildList;
    readonly memberMachine: TExoMachine<TWiring, unknown, TBucketMemberSlot>;
    readonly selectBucketSlot: (c: TNode, db: OIMDB) => TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>, TBucketMemberSlot>;
};
