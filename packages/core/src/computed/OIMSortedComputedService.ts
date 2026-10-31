import type { OIMComputedSlot } from './OIMComputedSlot';
import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import type { TOIMIndexStoreSlot } from '../index/types/TOIMIndexStoreSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { OIMBucketContentService } from '../bucket/OIMBucketContentService';
import type { OIMSlotCollectionIndexService } from '../index/OIMSlotCollectionIndexService';
import type { TOIMSortColumn } from './types/TOIMSortColumn';
import type { TOIMSortedComputedSlot } from './types/TOIMSortedComputedSlot';
import type { TOIMSlotCollectionIndexServiceStoreSlot } from '../index/types/TOIMSlotCollectionIndexServiceStoreSlot';
import type { TOIMSortedComputedServiceOptions } from './types/TOIMSortedComputedServiceOptions';
import { OIMComputedContentService } from './OIMComputedContentService';
import { createOIMComputedSlotCollectionService } from './utils/createOIMComputedSlotCollectionService';
import { oimSameSlotSequence } from '../bucket/utils/oimSameSlotSequence';
import { oimIsRevisionAfter } from '../channel/utils/oimIsRevisionAfter';
import { OIMComputedValueService } from './OIMComputedValueService';
import { OIM_FROZEN_EMPTY_SLOTS } from '../slot/constants/OIM_FROZEN_EMPTY_SLOTS';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { oimColumnsComparator } from './utils/oimColumnsComparator';
import { oimEntitySlotsComparator } from './utils/oimEntitySlotsComparator';

type TOIMEntityBucketContentService<TEntity extends object, TSlots> = Pick<
    OIMBucketContentService<TOIMEntitySlot<TEntity>, TSlots>, 'getBucketMemberSlots' | 'getBucketMemberSlotCount' | 'hasBucketMemberSlot'
>;

export class OIMSortedComputedService<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore, TComputedStore,
> {
    public readonly computedCollectionService: OIMSlotCollectionService<
        TKey, TOIMSortedComputedSlot<TEntity, TKey>, TComputedStore,
        OIMComputedContentService<readonly TOIMEntitySlot<TEntity>[], TOIMSortedComputedSlot<TEntity, TKey>>,
        string, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
    >;

    public constructor(options: TOIMSortedComputedServiceOptions<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TComputedStore>) {
        const indexService = options.indexService;
        const bucketContentService = indexService.slotContentService;
        const sortColumns = options.sortColumns;
        const hasComparator = options.comparator !== undefined;
        const compareEntitySlots = oimEntitySlotsComparator<TEntity>(
            options.comparator ?? (sortColumns === undefined ? compareNothing : oimColumnsComparator(sortColumns)),
        );
        const computedValueService = new OIMComputedValueService<readonly TOIMEntitySlot<TEntity>[], TOIMSortedComputedSlot<TEntity, TKey>>({
            derive: computedSlot => sortBucketMemberSlots(computedSlot, bucketContentService, compareEntitySlots),
            sameValueGuard: oimSameSlotSequence,
        });
        this.computedCollectionService = createOIMComputedSlotCollectionService<
            TKey, readonly TOIMEntitySlot<TEntity>[], TOIMSortedComputedSlot<TEntity, TKey>, TComputedStore, string
        >({
            slotContentService: new OIMComputedContentService<readonly TOIMEntitySlot<TEntity>[], TOIMSortedComputedSlot<TEntity, TKey>>({
                computedValueService,
                createSources: computedSlot => createSortedComputedSources(
                computedSlot.key, computedSlot.storeSlot, indexService, sortColumns, hasComparator,
            ),
                initialValue: OIM_FROZEN_EMPTY_SLOTS as readonly TOIMEntitySlot<TEntity>[],
            }),
            slotReleasePolicy: options.slotReleasePolicy,
            computedSlotStoreService: options.computedSlotStoreService,
            columnSlotOwnerOptions: { columnSlotStoreService: options.columnSlotStoreService },
            storeSlotListener: options.storeSlotListener,
        });
    }

    public createSortedStoreSlot(
        indexStoreSlot: TOIMSlotCollectionIndexServiceStoreSlot<TKey, TEntity, TSlots, TSourceKey, TSourceStore>,
    ): TOIMStoreSlot<TComputedStore, TOIMSortedComputedSlot<TEntity, TKey>, unknown, this['computedCollectionService']> {
        return this.computedCollectionService.createStoreSlotFrom(indexStoreSlot);
    }
}

function compareNothing(): number {
    return 0;
}

function createSortedComputedSources<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore,
>(
    key: TKey,
    storeSlot: TOIMStoreSlot,
    indexService: OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore>,
    sortColumns: readonly TOIMSortColumn<TEntity>[] | undefined,
    hasComparator: boolean,
): Partial<TOIMComputedSources> {
    const indexStoreSlot = storeSlot.sourceStoreSlot as TOIMIndexStoreSlot as
        TOIMSlotCollectionIndexServiceStoreSlot<TKey, TEntity, TSlots, TSourceKey, TSourceStore>;
    const sourceSlots: TOIMSlot[] = [indexService.getSlotByKey(indexStoreSlot, key)];
    if (sortColumns !== undefined) {
        for (let i = 0; i < sortColumns.length; i++) {
            sourceSlots.push(indexService.getBucketColumnByKey(indexStoreSlot, key, sortColumns[i].columnName));
        }
    } else if (hasComparator) {
        sourceSlots.push(indexService.getAnyBucketColumnByKey(indexStoreSlot, key));
    }
    return { sourceSlots };
}

function sortBucketMemberSlots<TKey extends NonNullable<unknown>, TEntity extends object, TSlots>(
    computedSlot: TOIMSortedComputedSlot<TEntity, TKey>,
    bucketContentService: TOIMEntityBucketContentService<TEntity, TSlots>,
    compareEntitySlots: (leftEntitySlot: TOIMEntitySlot<TEntity>, rightEntitySlot: TOIMEntitySlot<TEntity>) => number,
): readonly TOIMEntitySlot<TEntity>[] {
    const bucketSlot = computedSlot.sourceSlots[0] as TOIMBucketSlot<TSlots>;
    const previous = (computedSlot as unknown as OIMComputedSlot<readonly TOIMEntitySlot<TEntity>[]>).content;
    const membershipChanged = oimIsRevisionAfter(
        bucketSlot.changedAtRevision, bucketSlot.changedAtEpoch, computedSlot.ranAtRevision, computedSlot.ranAtEpoch,
    );
    const next = membershipChanged
        ? reconcileArrayWithBucketMemberSlots(computedSlot, bucketContentService, bucketSlot)
        : previous.slice();
    next.sort(compareEntitySlots);
    return next;
}

function reconcileArrayWithBucketMemberSlots<TKey extends NonNullable<unknown>, TEntity extends object, TSlots>(
    computedSlot: TOIMSortedComputedSlot<TEntity, TKey>,
    bucketContentService: TOIMEntityBucketContentService<TEntity, TSlots>,
    bucketSlot: TOIMBucketSlot<TSlots>,
): TOIMEntitySlot<TEntity>[] {
    const storeSlot = computedSlot.storeSlot as TOIMEditable<TOIMStoreSlot>;
    const keptStampedEntitySlots = (storeSlot.keptStampedEntitySlots ??= new Set<TOIMSlot>()) as Set<TOIMEntitySlot<TEntity>>;
    if (keptStampedEntitySlots.size !== 0) keptStampedEntitySlots.clear();
    const entitySlots = (computedSlot as unknown as OIMComputedSlot<readonly TOIMEntitySlot<TEntity>[]>).content;
    const ranAtRevision = computedSlot.ranAtRevision;
    const ranAtEpoch = computedSlot.ranAtEpoch;
    const next: TOIMEntitySlot<TEntity>[] = [];
    for (let i = 0; i < entitySlots.length; i++) {
        const entitySlot = entitySlots[i];
        if (!oimIsRevisionAfter(entitySlot.changedAtRevision, entitySlot.changedAtEpoch, ranAtRevision, ranAtEpoch)) {
            next.push(entitySlot);
        } else if (bucketContentService.hasBucketMemberSlot(bucketSlot, entitySlot)) {
            next.push(entitySlot);
            keptStampedEntitySlots.add(entitySlot);
        }
    }
    let arrivedCount = bucketContentService.getBucketMemberSlotCount(bucketSlot) - next.length;
    if (arrivedCount > 0) {
        for (const bucketMemberSlot of bucketContentService.getBucketMemberSlots(bucketSlot)) {
            if (!oimIsRevisionAfter(
                bucketMemberSlot.changedAtRevision, bucketMemberSlot.changedAtEpoch, ranAtRevision, ranAtEpoch,
            )) continue;
            if (keptStampedEntitySlots.has(bucketMemberSlot)) continue;
            next.push(bucketMemberSlot);
            if (--arrivedCount === 0) break;
        }
    }
    if (keptStampedEntitySlots.size !== 0) keptStampedEntitySlots.clear();
    if (arrivedCount === 0) return next;
    return reconcileArrayWithEveryBucketMemberSlot(entitySlots, bucketContentService.getBucketMemberSlots(bucketSlot));
}

function reconcileArrayWithEveryBucketMemberSlot<TEntity extends object>(
    entitySlots: readonly TOIMEntitySlot<TEntity>[], bucketMemberSlots: Iterable<TOIMEntitySlot<TEntity>>,
): TOIMEntitySlot<TEntity>[] {
    const unplacedBucketMemberSlots = new Set(bucketMemberSlots);
    const next: TOIMEntitySlot<TEntity>[] = [];
    for (let i = 0; i < entitySlots.length; i++) {
        if (unplacedBucketMemberSlots.delete(entitySlots[i])) next.push(entitySlots[i]);
    }
    for (const arrivedBucketMemberSlot of unplacedBucketMemberSlots) next.push(arrivedBucketMemberSlot);
    return next;
}
