import type { TOIMSlotCollectionServiceOptions } from '../../slot/types/TOIMSlotCollectionServiceOptions';
import type { OIMSlotCollectionService } from '../../slot/OIMSlotCollectionService';
import type { IOIMIndexKeysService } from '../../../engine/index/interfaces/IOIMIndexKeysService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMKeyedSlot } from '../../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMColumnSlot } from '../../../engine/column/types/TOIMColumnSlot';
import type { OIMPushColumnSlotOwner } from '../../../engine/column/OIMPushColumnSlotOwner';

export type TOIMSlotCollectionIndexServiceOptions<
    TKey extends NonNullable<unknown>, TEntity extends object, TBucketSlot extends TOIMKeyedSlot<TKey>, TStore, TSlotContentService,
    TSourceKey extends NonNullable<unknown>, TSourceStore,
> = TOIMSlotCollectionServiceOptions<
    TKey, TBucketSlot, TStore, TSlotContentService, string, TOIMColumnSlot, OIMPushColumnSlotOwner, readonly TOIMEntitySlot<TEntity>[]
> & {
    keyOf: (entity: TEntity) => TKey;
    columns?: readonly string[] | undefined;
    sourceSlotCollectionService: Pick<OIMSlotCollectionService<TSourceKey, TOIMEntitySlot<TEntity, TSourceKey>, TSourceStore, unknown>, 'getSlots'>;
    indexKeysService: IOIMIndexKeysService;
};
