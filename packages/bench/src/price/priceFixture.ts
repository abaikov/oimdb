// Prose: ./README.md#pricefixture
import {
    OIMDB,
    OIMSlotStoreServiceMapDriven,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
} from '../../../core/src/index';
import type {
    OIMColumnOwnerPushDriven, OIMSlotCollectionService, OIMSlotContentEntityService,
    TOIMColumnSlot, TOIMEntityColumnName, TOIMEntitySlot, TOIMStoreKey, IOIMEntityWriter,
} from '../../../core/src/index';
import { priceDataset } from './priceDataset';
import type { TPriceDataRow } from './TPriceDataRow';

const inPlaceShared: IOIMEntityWriter = createOIMEntityWriterInPlace();

export type TPriceEntityService<TEntity extends object> = OIMSlotCollectionService<
    TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
    OIMSlotContentEntityService<TEntity, TOIMStoreKey, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>, TOIMEntityColumnName<TEntity>>,
    TOIMEntityColumnName<TEntity>, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
>;

export const priceLoadedCollection = <TEntity extends { id: string }>(
    db: OIMDB,
    entityService: TPriceEntityService<TEntity>,
    entityStoreSlot: ReturnType<TPriceEntityService<TEntity>['createStoreSlot']>,
    entities: readonly TEntity[],
) => {
    const slots: TOIMEntitySlot<TEntity, TOIMStoreKey>[] = [];
    for (let i = 0; i < entities.length; i++) slots.push(entityService.slotContentService.upsertEntity(entityStoreSlot, entities[i]));
    db.flush();
    return { db, entityService, entityStoreSlot, slots };
};

export const priceCollectionFixture = <TEntity extends { id: string }>(
    entities: readonly TEntity[],
    write: IOIMEntityWriter = inPlaceShared,
) => {
    const db = new OIMDB();
    const entityService: TPriceEntityService<TEntity> = createOIMEntityService<TEntity>(db, {
        keyOf: (entity: TEntity) => entity.id,
        entityWriter: write,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
    });
    return priceLoadedCollection(db, entityService, entityService.createStoreSlot(db), entities);
};

export const priceFixture = (rowCount: number, write: IOIMEntityWriter = inPlaceShared) => {
    const rows = priceDataset.makeRows(rowCount);
    const { db, entityService, entityStoreSlot, slots } = priceCollectionFixture(rows, write);

    const byId = new Map<string, TPriceDataRow>();
    const held: TPriceDataRow[] = [];
    for (let i = 0; i < rows.length; i++) {
        const copy = { ...rows[i] };
        byId.set(copy.id, copy);
        held.push(copy);
    }

    return { rows, db, entityService, entityStoreSlot, slots, byId, held };
};
