import type { OIMDB } from './OIMDB';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../engine/entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../engine/store/types/TOIMStoreKey';
import type { TOIMColumnSlot } from '../engine/column/types/TOIMColumnSlot';
import type { OIMColumnOwnerPushDriven } from '../engine/column/OIMColumnOwnerPushDriven';
import type { OIMSlotContentEntityService } from '../engine/entity/OIMSlotContentEntityService';
import type { OIMSlotCollectionService } from '../facade/slot/OIMSlotCollectionService';
import type { TOIMSlotContentEntityServiceFactoryOptions } from './types/TOIMSlotContentEntityServiceFactoryOptions';
import { createOIMSlotCollectionService } from './createOIMSlotCollectionService';
import { createOIMSlotContentEntityService } from './createOIMSlotContentEntityService';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';

export function createOIMEntityService<
    TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>,
    TKey extends TOIMStoreKey = TOIMStoreKey,
>(
    db: OIMDB,
    options: TOIMSlotContentEntityServiceFactoryOptions<TEntity, TKey, TColumnName> & {
        keyOf: (entity: TEntity) => TKey;
        entitySlotStoreService?: undefined;
    },
): OIMSlotCollectionService<
    TKey, TOIMEntitySlot<TEntity, TKey>, Map<TKey, TOIMEntitySlot<TEntity, TKey>>,
    OIMSlotContentEntityService<TEntity, TKey, Map<TKey, TOIMEntitySlot<TEntity, TKey>>, TColumnName>,
    TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
>;
export function createOIMEntityService<
    TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>,
    TKey extends TOIMStoreKey | readonly unknown[] = TOIMStoreKey, TStore = Map<TKey, TOIMEntitySlot<TEntity, TKey>>,
>(
    db: OIMDB,
    options: TOIMSlotContentEntityServiceFactoryOptions<TEntity, TKey, TColumnName> & {
        keyOf: (entity: TEntity) => TKey;
        entitySlotStoreService: IOIMSlotStoreService<TKey, TOIMEntitySlot<TEntity, TKey>, TStore>;
    },
): OIMSlotCollectionService<
    TKey, TOIMEntitySlot<TEntity, TKey>, TStore, OIMSlotContentEntityService<TEntity, TKey, TStore, TColumnName>,
    TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
>;
export function createOIMEntityService<
    TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity>, TKey extends TOIMStoreKey | readonly unknown[], TStore,
>(
    db: OIMDB,
    options: TOIMSlotContentEntityServiceFactoryOptions<TEntity, TKey, TColumnName> & {
        keyOf: (entity: TEntity) => TKey;
        entitySlotStoreService?: IOIMSlotStoreService<TKey, TOIMEntitySlot<TEntity, TKey>, TStore> | undefined;
    },
): OIMSlotCollectionService<
    TKey, TOIMEntitySlot<TEntity, TKey>, TStore, OIMSlotContentEntityService<TEntity, TKey, TStore, TColumnName>,
    TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
> {
    return createOIMSlotCollectionService<
        TKey, TOIMEntitySlot<TEntity, TKey>, TStore, OIMSlotContentEntityService<TEntity, TKey, TStore, TColumnName>,
        TColumnName, Partial<TEntity>
    >({
        slotContentService: createOIMSlotContentEntityService<TEntity, TColumnName, TKey, TStore>(db, {
            ...options,
            slotStoreService: oimSlotStoreServiceWithDefault(options.entitySlotStoreService),
        }),
    });
}
