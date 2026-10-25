import type { OIMDB } from './OIMDB';
import type { IOIMEntityWriter } from '../engine/entity/interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptinessPolicy } from '../engine/slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntityContentSlot } from '../engine/entity/types/TOIMEntityContentSlot';
import type { TOIMEntityColumnName } from '../engine/entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../engine/store/types/TOIMStoreKey';
import { OIMSlotContentEntityService } from '../engine/entity/OIMSlotContentEntityService';
import { OIM_DEFAULT_ENTITY_SLOT_EMPTINESS } from './defaults/OIM_DEFAULT_ENTITY_SLOT_EMPTINESS';
import { OIM_DEFAULT_ENTITY_WRITER } from './defaults/OIM_DEFAULT_ENTITY_WRITER';

export function createOIMSlotContentEntityService<
    TEntity extends object, TKey extends NonNullable<unknown> = TOIMStoreKey,
    TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>,
>(
    db: OIMDB,
    options: {
        entityWriter?: IOIMEntityWriter | undefined;
        slotEmptinessPolicy?: IOIMSlotEmptinessPolicy<TOIMEntityContentSlot<TEntity>> | undefined;
    } = {},
): OIMSlotContentEntityService<TEntity, TKey, TColumnName> {
    return new OIMSlotContentEntityService<TEntity, TKey, TColumnName>({
        entityWriter: options.entityWriter ?? db.entityWriter ?? OIM_DEFAULT_ENTITY_WRITER.getValue(),
        slotEmptinessPolicy: options.slotEmptinessPolicy ?? OIM_DEFAULT_ENTITY_SLOT_EMPTINESS.getValue(),
    });
}
