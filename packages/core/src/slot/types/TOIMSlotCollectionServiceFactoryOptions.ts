import type { TOIMColumnGroup } from '../../column/types/TOIMColumnGroup';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from '../interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotContentWriter } from '../interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from '../interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../interfaces/IOIMKeyedSlotCreator';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { OIMDefaults } from '../../db/OIMDefaults';
import type { TOIMKeyedSlot } from './TOIMKeyedSlot';

export type TOIMSlotCollectionServiceFactoryOptions<
    TSlotContentService, TStore, TColumnName extends string,
    TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TContent,
> = {
    defaults?: OIMDefaults | undefined;
    slotContentService: TSlotContentService
        & IOIMKeyedSlotCreator<TKey, TSlot>
        & IOIMSlotContentWriter<NoInfer<TSlot>, TContent>
        & IOIMSlotContentService<NoInfer<TSlot>>;
    slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
    slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
    columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
    columnNames?: readonly TColumnName[] | undefined;
    columnGroups?: readonly TOIMColumnGroup<TColumnName>[] | undefined;
} & ([TKey] extends [readonly unknown[]] ? {
    slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore>;
} : {
    slotStoreService?: IOIMSlotStoreService<TKey, TSlot, TStore> | undefined;
});
