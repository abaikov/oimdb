import type { TOIMSlotCollectionServiceOptions } from '../../slot/types/TOIMSlotCollectionServiceOptions';
import type { OIMSlotCollectionService } from '../../slot/OIMSlotCollectionService';
import type { IOIMIndexKeysService } from '../interfaces/IOIMIndexKeysService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { OIMPushColumnSlotOwner } from '../../column/OIMPushColumnSlotOwner';

export type TOIMSlotCollectionIndexServiceOptions<
    TKey extends NonNullable<unknown>, TEntity extends object, TBucketSlot extends TOIMKeyedSlot<TKey>, TStore, TSlotContentService,
    TSourceKey extends NonNullable<unknown>, TSourceStore,
> = TOIMSlotCollectionServiceOptions<
    TKey, TBucketSlot, TStore, TSlotContentService, string, TOIMColumnSlot, OIMPushColumnSlotOwner
> & {
    keyOf: (entity: TEntity) => TKey;
    columns?: readonly string[] | undefined;
    sourceSlotCollectionService: Pick<OIMSlotCollectionService<TSourceKey, TOIMEntitySlot<TEntity, TSourceKey>, TSourceStore, unknown>, 'getSlots'>;
    indexKeysService: IOIMIndexKeysService;
};
