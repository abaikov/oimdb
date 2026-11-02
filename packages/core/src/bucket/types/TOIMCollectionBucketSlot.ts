import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMBucketContentSlot } from './TOIMBucketContentSlot';
import type { TOIMBucketSlotsSetStore } from './TOIMBucketSlotsSetStore';

export type TOIMCollectionBucketSlot<TSlot extends TOIMSlot = TOIMSlot> = TOIMSlot & Pick<
    TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TSlot>, TSlot>,
    'getBucketMemberSlots' | 'getBucketMemberSlotCount' | 'hasBucketMemberSlot' | 'holdSlot' | 'unholdSlot'
>;
