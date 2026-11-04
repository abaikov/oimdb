import type { OIMDB } from '../../db/OIMDB';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { OIMSlotTreeStoreService } from '../../store/OIMSlotTreeStoreService';
import { OIMScalarKeyTreeWalk } from '../../key/OIMScalarKeyTreeWalk';
import { OIMSlotMapStoreService } from '../../store/OIMSlotMapStoreService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMReplacingEntityWriter } from '../../entity/createOIMReplacingEntityWriter';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { createOIMSlotCollectionStoreAggregate } from '../createOIMSlotCollectionStoreAggregate';

type TKeyPart = TOIMStoreKey | null | undefined;

export function aGenericChainKeyedAggregate<TData extends object, TKey extends readonly TKeyPart[]>(db: OIMDB, key: TKey): TData | undefined {
    const slots = createOIMSlotCollectionStoreAggregate(db, {
        slotContentService: createOIMEntityContentService<TData, TKey>({ entityWriter: createOIMReplacingEntityWriter() }),
        slotStoreService: new OIMSlotTreeStoreService<TKeyPart, TOIMEntitySlot<TData, TKey>>(OIMScalarKeyTreeWalk.INSTANCE),
    });
    return slots.getSlotByKey(key).entity;
}

export function aGenericScalarKeyedService<TData extends object, TKey extends TOIMStoreKey>(db: OIMDB, key: TKey, data: TData): TData | undefined {
    const service = createOIMSlotCollectionService({
        slotContentService: createOIMEntityContentService<TData, TKey>(),
        slotStoreService: new OIMSlotMapStoreService<TOIMEntitySlot<TData, TKey>>(),
    });
    const storeSlot = service.createStoreSlot(db);
    service.writeSlotContentByKey(storeSlot, key, data);
    return service.getSlotByKey(storeSlot, key).entity;
}

export function aGenericChainKeyWithoutAStoreIsRefused<TData extends object, TKey extends readonly TKeyPart[]>(): void {
    // @ts-expect-error a chain key needs a tree store
    createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TData, TKey>() });
}
