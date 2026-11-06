import type { TExoChildrenPort, TExoMachine } from '@exodra/core';
import type { TOIMBucketContentSlot, TOIMBucketSlotsArrayStore, TOIMSlot } from '@oimdb/core';

export type TOIMBucketChildrenOptions<TParams, TWiring, TBucketMemberSlot extends TOIMSlot> = {
    readonly childrenPort: TExoChildrenPort;
    readonly memberMachine: TExoMachine<TWiring, unknown, TBucketMemberSlot>;
    readonly selectBucketSlot: (params: TParams) => TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>, TBucketMemberSlot>;
};
