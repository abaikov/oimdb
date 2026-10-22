import type { OIMColumnOwnerPullDriven } from '../../engine/column/OIMColumnOwnerPullDriven';
import type { TOIMComputedColumnSlot } from '../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMComputedSources } from '../../engine/computed/types/TOIMComputedSources';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMIndexStoreSlot } from '../../engine/index/types/TOIMIndexStoreSlot';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMSlotEditable } from '../../engine/slot/types/TOIMSlotEditable';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { OIMSlotContentBucketService } from '../bucket/OIMSlotContentBucketService';
import type { OIMIndexService } from '../index/OIMIndexService';
import type { TOIMSortColumn } from './types/TOIMSortColumn';
import type { TOIMSortedComputedSlot } from './types/TOIMSortedComputedSlot';
import type { TOIMIndexServiceStoreSlot } from '../index/types/TOIMIndexServiceStoreSlot';
import type { TOIMComputedServiceSortedOptions } from './types/TOIMComputedServiceSortedOptions';
import { createOIMComputedCollectionService } from './utils/createOIMComputedCollectionService';
import { oimSameSlotSequence } from '../../engine/bucket/utils/oimSameSlotSequence';
import { oimIsRevisionAfter } from '../../engine/channel/utils/oimIsRevisionAfter';
import { OIMComputedValueService } from '../../engine/computed/OIMComputedValueService';
import { OIM_FROZEN_EMPTY_SLOTS } from '../../engine/slot/constants/OIM_FROZEN_EMPTY_SLOTS';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { oimColumnsComparator } from './utils/oimColumnsComparator';
import { oimEntitySlotsComparator } from './utils/oimEntitySlotsComparator';

type TOIMEntityBucketContentService<TEntity extends object, TSlots> = Pick<
    OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>, 'getBucketMemberSlots' | 'getBucketMemberSlotCount' | 'hasBucketMemberSlot'
>;

export class OIMComputedServiceSorted<TKey, TEntity extends object, TSlots, TSourceKey, TSourceStore, TComputedStore> {
    public readonly computedCollectionService: OIMSlotCollectionService<
        TKey, TOIMSortedComputedSlot<TEntity, TKey>, TComputedStore,
        OIMComputedValueService<TKey, readonly TOIMEntitySlot<TEntity>[]>,
        string, TOIMComputedColumnSlot, OIMColumnOwnerPullDriven
    >;

    public constructor(options: TOIMComputedServiceSortedOptions<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TComputedStore>) {
        const indexService = options.indexService;
        const bucketContentService = indexService.slotContentService;
        const sortColumns = options.sortColumns;
        const hasComparator = options.comparator !== undefined;
        const compareEntitySlots = oimEntitySlotsComparator<TEntity>(
            options.comparator ?? (sortColumns === undefined ? compareNothing : oimColumnsComparator(sortColumns)),
        );
        const computedValueService = new OIMComputedValueService<TKey, readonly TOIMEntitySlot<TEntity>[]>({
            derive: computedSlot => sortBucketMemberSlots(computedSlot, bucketContentService, compareEntitySlots),
            sameValueGuard: oimSameSlotSequence,
        });
        this.computedCollectionService = createOIMComputedCollectionService<
            TKey, readonly TOIMEntitySlot<TEntity>[], TOIMSortedComputedSlot<TEntity, TKey>, TComputedStore, string
        >({
            computedValueService,
            createSources: (key, storeSlot) => createSortedSources(key, storeSlot, indexService, sortColumns, hasComparator),
            initialValue: OIM_FROZEN_EMPTY_SLOTS as readonly TOIMEntitySlot<TEntity>[],
            slotReleasePolicy: options.slotReleasePolicy,
            computedSlotStoreService: options.computedSlotStoreService,
            columnOwnerOptions: { columnSlotStoreService: options.columnSlotStoreService },
            storeSlotListener: options.storeSlotListener,
        });
    }

    public createSortedStoreSlot(
        indexStoreSlot: TOIMIndexServiceStoreSlot<TKey, TEntity, TSlots, TSourceKey, TSourceStore>,
    ): TOIMStoreSlot<TComputedStore, TOIMSortedComputedSlot<TEntity, TKey>> {
        return this.computedCollectionService.createStoreSlotFrom(indexStoreSlot);
    }
}

function compareNothing(): number {
    return 0;
}

function createSortedSources<TKey, TEntity extends object, TSlots, TSourceKey, TSourceStore>(
    key: TKey,
    storeSlot: TOIMStoreSlot | undefined,
    indexService: OIMIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore>,
    sortColumns: readonly TOIMSortColumn<TEntity>[] | undefined,
    hasComparator: boolean,
): Partial<TOIMComputedSources> {
    const indexStoreSlot = (storeSlot as TOIMStoreSlot).sourceStoreSlot as TOIMIndexStoreSlot as
        TOIMIndexServiceStoreSlot<TKey, TEntity, TSlots, TSourceKey, TSourceStore>;
    const sourceSlots: TOIMSlot[] = [indexService.getSlotByKey(indexStoreSlot, key)];
    if (sortColumns !== undefined) {
        for (let i = 0; i < sortColumns.length; i++) {
            sourceSlots.push(indexService.getBucketColumnByKey(indexStoreSlot, key, sortColumns[i].column));
        }
    } else if (hasComparator) {
        sourceSlots.push(indexService.getAnyBucketColumnByKey(indexStoreSlot, key));
    }
    return { sourceSlots };
}

function sortBucketMemberSlots<TKey, TEntity extends object, TSlots>(
    computedSlot: TOIMSortedComputedSlot<TEntity, TKey>,
    bucketContentService: TOIMEntityBucketContentService<TEntity, TSlots>,
    compareEntitySlots: (leftEntitySlot: TOIMEntitySlot<TEntity>, rightEntitySlot: TOIMEntitySlot<TEntity>) => number,
): readonly TOIMEntitySlot<TEntity>[] {
    const bucketSlot = computedSlot.sourceSlots[0] as TOIMBucketSlot<TSlots>;
    const previous = computedSlot.value;
    const membershipChanged = oimIsRevisionAfter(
        bucketSlot.changedAtRevision, bucketSlot.changedAtEpoch, computedSlot.ranAtRevision, computedSlot.ranAtEpoch,
    );
    const next = membershipChanged
        ? reconcileArrayWithBucketMemberSlots(computedSlot, bucketContentService, bucketSlot)
        : previous.slice();
    next.sort(compareEntitySlots);
    return next;
}

function reconcileArrayWithBucketMemberSlots<TKey, TEntity extends object, TSlots>(
    computedSlot: TOIMSortedComputedSlot<TEntity, TKey>,
    bucketContentService: TOIMEntityBucketContentService<TEntity, TSlots>,
    bucketSlot: TOIMBucketSlot<TSlots>,
): TOIMEntitySlot<TEntity>[] {
    const storeSlot = computedSlot.storeSlot as TOIMSlotEditable<TOIMStoreSlot>;
    const keptStampedEntitySlots = (storeSlot.keptStampedEntitySlots ??= new Set<TOIMSlot>()) as Set<TOIMEntitySlot<TEntity>>;
    if (keptStampedEntitySlots.size !== 0) keptStampedEntitySlots.clear();
    const entitySlots = computedSlot.value;
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
