import type { OIMDB } from './OIMDB';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../engine/entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../engine/store/types/TOIMStoreKey';
import type { TOIMSingleSlotStore } from '../engine/store/types/TOIMSingleSlotStore';
import type { OIMSlotStoreServiceSingleSlotDriven } from '../engine/store/OIMSlotStoreServiceSingleSlotDriven';
import type { TOIMSlotContentEntityServiceFactoryOptions } from './types/TOIMSlotContentEntityServiceFactoryOptions';
import { OIMSlotContentEntityService } from '../engine/entity/OIMSlotContentEntityService';
import { createOIMColumnOwnerPushDriven } from '../engine/column/utils/createOIMColumnOwnerPushDriven';
import { OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE } from './defaults/OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_ENTITY_SLOT_EMPTINESS } from './defaults/OIM_DEFAULT_ENTITY_SLOT_EMPTINESS';
import { OIM_DEFAULT_ENTITY_WRITER } from './defaults/OIM_DEFAULT_ENTITY_WRITER';
import { oimColumnOwnerOptionsWithDefault } from './utils/oimColumnOwnerOptionsWithDefault';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';

const keyOfNothing = (): void => undefined;

export function createOIMSlotContentEntityService<
    TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>,
>(
    db: OIMDB,
    options: TOIMSlotContentEntityServiceFactoryOptions<TEntity, void, TColumnName> & {
        keyOf?: undefined;
        slotStoreService: OIMSlotStoreServiceSingleSlotDriven<TOIMEntitySlot<TEntity, void>>;
    },
): OIMSlotContentEntityService<TEntity, void, TOIMSingleSlotStore<TOIMEntitySlot<TEntity, void>>, TColumnName>;
export function createOIMSlotContentEntityService<
    TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>,
    TKey extends TOIMStoreKey = TOIMStoreKey,
>(
    db: OIMDB,
    options: TOIMSlotContentEntityServiceFactoryOptions<TEntity, TKey, TColumnName> & {
        keyOf: (entity: TEntity) => TKey;
        slotStoreService?: undefined;
    },
): OIMSlotContentEntityService<TEntity, TKey, Map<TKey, TOIMEntitySlot<TEntity, TKey>>, TColumnName>;
export function createOIMSlotContentEntityService<
    TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>,
    TKey extends TOIMStoreKey | readonly unknown[] = TOIMStoreKey, TStore = Map<TKey, TOIMEntitySlot<TEntity, TKey>>,
>(
    db: OIMDB,
    options: TOIMSlotContentEntityServiceFactoryOptions<TEntity, TKey, TColumnName> & {
        keyOf: (entity: TEntity) => TKey;
        slotStoreService: IOIMSlotStoreService<TKey, TOIMEntitySlot<TEntity, TKey>, TStore>;
    },
): OIMSlotContentEntityService<TEntity, TKey, TStore, TColumnName>;
export function createOIMSlotContentEntityService<TEntity extends object, TColumnName extends string, TKey, TStore>(
    db: OIMDB,
    options: TOIMSlotContentEntityServiceFactoryOptions<TEntity, TKey, TColumnName> & {
        keyOf?: ((entity: TEntity) => TKey) | undefined;
        slotStoreService?: IOIMSlotStoreService<TKey, TOIMEntitySlot<TEntity, TKey>, TStore> | undefined;
    },
): OIMSlotContentEntityService<TEntity, TKey, TStore, TColumnName> {
    return new OIMSlotContentEntityService<TEntity, TKey, TStore, TColumnName>({
        keyOf: options.keyOf ?? keyOfNothing as () => TKey,
        entityWriter: options.entityWriter ?? db.entityWriter ?? OIM_DEFAULT_ENTITY_WRITER.getValue(),
        slotEmptiness: options.slotEmptiness ?? OIM_DEFAULT_ENTITY_SLOT_EMPTINESS.getValue(),
        slotStoreService: oimSlotStoreServiceWithDefault(options.slotStoreService),
        slotStamp: db.slotStamp,
        slotReleasePolicy: options.slotReleasePolicy ?? db.slotReleasePolicy,
        columnOwnerOptions: oimColumnOwnerOptionsWithDefault(
            options.columnSlotStoreService, options.columnNames, OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE.getValue(),
        ),
        createColumnOwner: createOIMColumnOwnerPushDriven,
    });
}
