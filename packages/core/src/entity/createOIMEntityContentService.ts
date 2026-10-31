import type { IOIMEntityWriter } from './interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptinessPolicy } from '../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntityContentSlot } from './types/TOIMEntityContentSlot';
import type { TOIMEntityColumnName } from './types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import { OIMEntityContentService } from './OIMEntityContentService';
import { OIMDefaults } from '../db/OIMDefaults';
import { OIM_DEFAULT_ENTITY_SLOT_EMPTINESS_POLICY } from '../db/constants/OIM_DEFAULT_ENTITY_SLOT_EMPTINESS_POLICY';
import { OIM_DEFAULT_ENTITY_WRITER } from '../db/constants/OIM_DEFAULT_ENTITY_WRITER';

export function createOIMEntityContentService<
    TEntity extends object, TKey extends NonNullable<unknown> = TOIMStoreKey,
    TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>,
>(
    options: {
        defaults?: OIMDefaults | undefined;
        entityWriter?: IOIMEntityWriter | undefined;
        slotEmptinessPolicy?: IOIMSlotEmptinessPolicy<TOIMEntityContentSlot<TEntity>> | undefined;
    } = {},
): OIMEntityContentService<TEntity, TKey, TColumnName> {
    const defaults = options.defaults ?? OIMDefaults.INSTANCE;
    return new OIMEntityContentService<TEntity, TKey, TColumnName>({
        entityWriter: options.entityWriter ?? defaults.entityWriter ?? OIM_DEFAULT_ENTITY_WRITER.getValue(),
        slotEmptinessPolicy: options.slotEmptinessPolicy ?? defaults.entitySlotEmptinessPolicy ?? OIM_DEFAULT_ENTITY_SLOT_EMPTINESS_POLICY.getValue(),
    });
}
