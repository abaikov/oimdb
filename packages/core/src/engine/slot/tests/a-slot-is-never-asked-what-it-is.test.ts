import { OIMDefaults } from '../../../factories/OIMDefaults';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { createOIMComputedServiceSorted } from '../../../factories/createOIMComputedServiceSorted';
import { OIM_SLOT_FLAG_EMPTY } from '../constants/OIM_SLOT_FLAG_EMPTY';

type TEntity = { id: string; queue: string; rank: number };

describe('subscribing to an identity the engine did not mint', () => {
    it('does not settle a slot that merely has a property called index', () => {
        const db = new OIMDB();
        let probed = 0;
        // Everything `TOIMSlot` asks for, plus an `index` that is a plain object
        // a consumer happened to hang there.
        const impostor = {
            effects: undefined,
            changedAtRevision: 0,
            changedAtEpoch: 0,
            effectEdges: undefined,
            holdCount: 0,
            slotFlags: OIM_SLOT_FLAG_EMPTY,
            releaseDueAfterWriteMs: -1,
        releaseDueAfterIdleMs: -1,
        releaseDueAfterUnholdMs: -1,
            columnSlotStore: undefined,
            storeSlot: undefined,
            owner: OIMDefaults.STANDALONE_SLOT_OWNER.getValue(),
            index: {
                probe: () => { probed++; },
            },
        };

        const effect = OIMEffectService.INSTANCE.createEffect(db, [impostor], [], () => { /* nothing to do */ });
        db.flush();
        OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(probed).toBe(0);
    });

    it('throws the sorter at the read that asks for the order, not at the subscribe', () => {
        const db = new OIMDB();
        const entitiesService = createOIMEntityService<TEntity>(db, { keyOf: entity => entity.id });
        const entities = entitiesService.createStoreSlot(db);
        const byQueueService = createOIMIndexService(db, {
            entityService: entitiesService,
            keyOf: (entity: TEntity) => entity.queue,
        });
        const byQueue = byQueueService.createIndexStoreSlot(entities);
        const byQueueOrdersService = createOIMComputedServiceSorted({
            indexService: byQueueService,
            comparator: () => { throw new Error('the sorter cannot rank these'); },
        });
        const byQueueOrders = byQueueOrdersService.createSortedStoreSlot(byQueue);
        const heldSlot = byQueueOrdersService.computedCollectionService.holdSlotByKey(byQueueOrders, 'q0');
        entitiesService.slotContentService.upsertEntities(entities, [{ id: 'k1', queue: 'q0', rank: 1 }, { id: 'k2', queue: 'q0', rank: 2 }]);

        const effect = OIMEffectService.INSTANCE.createEffect(db, [], [heldSlot], () => { /* never reached */ });

        expect(() => byQueueOrdersService.computedCollectionService.slotContentService.getValueForSlot(heldSlot)).toThrow(/cannot rank these/);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });
});
