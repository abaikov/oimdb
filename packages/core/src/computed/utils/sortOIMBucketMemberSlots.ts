import type { OIMComputedSlot } from '../OIMComputedSlot';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import { isOIMRevisionAfter } from '../../channel/utils/isOIMRevisionAfter';

export function sortOIMBucketMemberSlots<TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>>(
    computedSlot: TOIMComputedContentSlot<readonly TOIMEntitySlot<TEntity, TSourceKey>[]>,
    bucketContentService: { getBucketMemberSlots(bucketSlot: TOIMBucketSlot<TSlots>): Iterable<TOIMEntitySlot<TEntity, TSourceKey>> },
    compareEntitySlots: (leftEntitySlot: TOIMEntitySlot<TEntity, TSourceKey>, rightEntitySlot: TOIMEntitySlot<TEntity, TSourceKey>) => number,
): readonly TOIMEntitySlot<TEntity, TSourceKey>[] {
    const bucketSlot = computedSlot.sourceSlots[0] as TOIMBucketSlot<TSlots>;
    const previous = (computedSlot as unknown as OIMComputedSlot<readonly TOIMEntitySlot<TEntity, TSourceKey>[]>).content;
    const membershipChanged = isOIMRevisionAfter(
        bucketSlot.changedAtRevision, bucketSlot.changedAtEpoch, computedSlot.ranAtRevision, computedSlot.ranAtEpoch,
    );
    const next = membershipChanged
        ? reconcileArrayWithEveryBucketMemberSlot(previous, bucketContentService.getBucketMemberSlots(bucketSlot))
        : previous.slice();
    next.sort(compareEntitySlots);
    return next;
}

function reconcileArrayWithEveryBucketMemberSlot<TEntity extends object, TSourceKey extends NonNullable<unknown>>(
    entitySlots: readonly TOIMEntitySlot<TEntity, TSourceKey>[], bucketMemberSlots: Iterable<TOIMEntitySlot<TEntity, TSourceKey>>,
): TOIMEntitySlot<TEntity, TSourceKey>[] {
    const unplacedBucketMemberSlots = new Set(bucketMemberSlots);
    const next: TOIMEntitySlot<TEntity, TSourceKey>[] = [];
    for (let i = 0; i < entitySlots.length; i++) {
        if (unplacedBucketMemberSlots.delete(entitySlots[i])) next.push(entitySlots[i]);
    }
    for (const arrivedBucketMemberSlot of unplacedBucketMemberSlots) next.push(arrivedBucketMemberSlot);
    return next;
}
