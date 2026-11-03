import { useMemo } from 'react';
import type {
    OIMBucketContentService, TOIMBucketContentSlot, TOIMEntitySlot,
} from '@oimdb/core';
import type { TOIMBinding } from './types/TOIMBinding';
import { useOIMValue } from './useOIMValue';
import { useOIMDB } from './useOIMDB';
import { assertOIMOneChannel } from './assertOIMOneChannel';

/** A bucket's slots, copied out of the service's LIVE container, in the collection's order. */
export function useOIMBucketSlots<TEntity extends object, TSlots = unknown>(
    bucketCollectionService: {
        readonly slotContentService: Pick<OIMBucketContentService<TOIMEntitySlot<TEntity>, TSlots>, 'getBucketMemberSlots'>;
    },
    bucketSlot: TOIMBucketContentSlot<TSlots>,
): readonly TOIMEntitySlot<TEntity>[] {
    const db = useOIMDB();
    const binding = useMemo((): TOIMBinding<TOIMBucketContentSlot<TSlots>> => {
        assertOIMOneChannel(db, bucketSlot, 'useOIMBucketSlots');
        return { sourceSlots: [bucketSlot], derive: () => bucketSlot };
    }, [db, bucketSlot]);
    const { changedAtRevision, changedAtEpoch } = useOIMValue(binding);
    return useMemo(
        () => Array.from(bucketCollectionService.slotContentService.getBucketMemberSlots(bucketSlot)),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the bucket slot's change stamp moves exactly when its members do
        [bucketCollectionService, bucketSlot, changedAtRevision, changedAtEpoch],
    );
}
