import type { OIMDB } from '../db/OIMDB';
import type { IOIMEntityWriter } from './interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptinessPolicy } from '../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntityContentSlot } from './types/TOIMEntityContentSlot';
import type { TOIMEntityColumnName } from './types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import { OIMSlotContentEntityService } from './OIMSlotContentEntityService';
import { OIM_DEFAULT_ENTITY_SLOT_EMPTINESS_POLICY } from '../db/constants/OIM_DEFAULT_ENTITY_SLOT_EMPTINESS_POLICY';
import { OIM_DEFAULT_ENTITY_WRITER } from '../db/constants/OIM_DEFAULT_ENTITY_WRITER';

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
        slotEmptinessPolicy: options.slotEmptinessPolicy ?? OIM_DEFAULT_ENTITY_SLOT_EMPTINESS_POLICY.getValue(),
    });
}
