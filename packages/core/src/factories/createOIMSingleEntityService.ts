import type { OIMDB } from './OIMDB';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMSlotContentEntityServiceFactoryOptions } from './types/TOIMSlotContentEntityServiceFactoryOptions';
import type { TOIMEntityColumnName } from '../engine/entity/types/TOIMEntityColumnName';
import type { TOIMColumnSlot } from '../engine/column/types/TOIMColumnSlot';
import type { OIMColumnOwnerPushDriven } from '../engine/column/OIMColumnOwnerPushDriven';
import type { TOIMSingleSlotStore } from '../engine/store/types/TOIMSingleSlotStore';
import type { OIMSlotContentEntityService } from '../engine/entity/OIMSlotContentEntityService';
import type { OIMSingleSlotService } from '../facade/slot/OIMSingleSlotService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../engine/store/OIMSlotStoreServiceSingleSlotDriven';
import { createOIMSingleSlotService } from './createOIMSingleSlotService';
import { createOIMSlotContentEntityService } from './createOIMSlotContentEntityService';

export function createOIMSingleEntityService<
    TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>,
>(
    db: OIMDB,
    options: TOIMSlotContentEntityServiceFactoryOptions<TEntity, void, TColumnName> = {},
): OIMSingleSlotService<
    TOIMEntitySlot<TEntity, void>, OIMSlotContentEntityService<TEntity, void, TOIMSingleSlotStore<TOIMEntitySlot<TEntity, void>>, TColumnName>,
    TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
> {
    return createOIMSingleSlotService<
        TOIMEntitySlot<TEntity, void>,
        OIMSlotContentEntityService<TEntity, void, TOIMSingleSlotStore<TOIMEntitySlot<TEntity, void>>, TColumnName>,
        TColumnName, Partial<TEntity>
    >({
        slotContentService: createOIMSlotContentEntityService<TEntity, TColumnName>(db, {
            ...options,
            slotStoreService: OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<
                TOIMEntitySlot<TEntity, void>
            >,
        }),
    });
}
