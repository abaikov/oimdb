import type { TOIMSlotEditable } from '../types/TOIMSlotEditable';

import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMSlotStoreServiceTreeDriven } from '../../store/OIMSlotStoreServiceTreeDriven';
import { OIMDefaults } from '../../../factories/OIMDefaults';
import { oimSameValueZeroGuard } from '../utils/oimSameValueZeroGuard';
import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../../entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMSlotStoreTree } from '../../store/types/TOIMSlotStoreTree';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture =(db = new OIMDB()) => {
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const reserve = (id: string): TOIMEntitySlot<TCard, TOIMStoreKey> => {
        const heldSlot = cardsService.holdSlotByKey(cards, id);
        reservations.push(() => { heldSlot.owner.unholdSlot(heldSlot); });
        return heldSlot;
    };
    // See {@link reservations}: anything still recorded belongs to a collection
    // the previous case has already dropped.
    reservations.length = 0;
    return { db, cardsService, cards, reserve, handBack };
};

const unorderedBuckets = (db: OIMDB) =>
    createOIMBucketService<
        TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });

const reservations: (() => void)[] = [];

const handBack = (): void => {
    for (const release of reservations) release();
    reservations.length = 0;
};

const bucketAt = <TStoreSlot, TBucketSlot extends TOIMSlot>(
    collectionService: { holdSlotByKey(storeSlot: TStoreSlot, key: TOIMStoreKey): TBucketSlot },
    collection: TStoreSlot, key: TOIMStoreKey,
): TBucketSlot => {
    const heldSlot = collectionService.holdSlotByKey(collection, key);
    reservations.push(() => { heldSlot.owner.unholdSlot(heldSlot); });
    return heldSlot;
};

describe('who triggers the release check', () => {
    it('detaching an effect: releases a reserved slot nothing else holds', () => {
        const { db, cardsService, cards, reserve, handBack } = createFixture();
        const effect = OIMEffectService.INSTANCE.createEffect(db, [reserve('ghost')], [], () => { /* held */ });
        // The effect is attached, so it is the one thing holding the slot from
        // here — which is what makes the dispose below the whole of the case.
        handBack();
        expect(cardsService.getSlotCount(cards)).toBe(1);
        OIMEffectService.INSTANCE.disposeEffect(effect);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('letting a derivation go: releases the slot it was reading', () => {
        const { db, cardsService, cards } = createFixture();
        const ranksService = createOIMComputedService<TOIMStoreKey, number>({
            createSources: (id: TOIMStoreKey) => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)] }),
            derive: (computedSlot) => (cardsService.getSlotByKey(cards, computedSlot.key).entity === undefined ? 0 : 1),
            sameValueGuard: oimSameValueZeroGuard,
        });
        const ranks = ranksService.createComputedStoreSlot(db);
        const heldSlot = ranksService.computedCollectionService.holdSlotByKey(ranks, 'ghost');
        expect(cardsService.getSlotCount(cards)).toBe(1);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);

        heldSlot.owner.unholdSlot(heldSlot);

        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('leaving the last manual bucket: releases the slot', () => {
        const { db, cardsService, cards, reserve, handBack } = createFixture();
        const searchService = unorderedBuckets(db);
        const search = searchService.createStoreSlot(db);
        const bucket = bucketAt(searchService, search, 'q');
        searchService.slotContentService.writeBucketMemberSlots(bucket, [reserve('ghost')]);
        // The bucket holds it, so that is the last thing pointing at the slot —
        // which is what the emptying below is being asked about.
        handBack();
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(1);
        searchService.slotContentService.writeBucketMemberSlots(bucket, []);
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });
});

describe('a hold is what carries an identity across a batch that empties it', () => {
    it('remove then re-upsert the same key in one batch keeps ONE identity, if something holds it', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'a' });
        db.flush();

        const resolved = cardsService.getSlotByKey(cards, 'c1')!;
        resolved.owner.holdSlot(resolved);

        cardsService.slotContentService.deleteEntity(resolved);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'b' });
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(resolved);
        expect(resolved.entity).toEqual({ id: 'c1', title: 'b' });
        expect(cardsService.getSlotCount(cards)).toBe(1);

        resolved.owner.unholdSlot(resolved);
    });

    it('and without one, the removal is the end of that identity', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'a' });
        db.flush();
        const was = cardsService.getSlotByKey(cards, 'c1')!;

        cardsService.slotContentService.deleteEntity(was);
        // Already gone: the value was the only thing pointing at it, and the
        // question was asked where the value left.
        expect(cardsService.getSlotCount(cards)).toBe(0);

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'b' });
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'c1')).not.toBe(was);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    it('a bucket emptied and refilled by two write in one frame keeps ONE identity, if something holds it', () => {
        const { db, cardsService, cards, reserve } = createFixture();
        const listService = createOIMBucketService<TCardSlot>(db);
        const list = listService.createStoreSlot(db);
        const page = bucketAt(listService, list, 'page');
        const ghost = reserve('ghost');
        ghost.owner.holdSlot(ghost);
        listService.slotContentService.writeBucketMemberSlots(page, [ghost]);
        db.flush();

        listService.slotContentService.writeBucketMemberSlots(page, []);
        listService.slotContentService.writeBucketMemberSlots(page, [ghost]);
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'ghost')).toBe(ghost);
        const listed = Array.from(listService.slotContentService.getBucketMemberSlots(page));
        expect(listed.length).toBe(1);
        expect(listed[0] === ghost).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        ghost.owner.unholdSlot(ghost);
    });

    it('the same through the position writes: clear then insertSlotAt', () => {
        const { db, cardsService, cards, reserve } = createFixture();
        const listService = createOIMBucketService<TCardSlot>(db);
        const list = listService.createStoreSlot(db);
        const page = bucketAt(listService, list, 'page');
        const ghost = reserve('ghost');
        ghost.owner.holdSlot(ghost);
        listService.slotContentService.writeBucketMemberSlots(page, [ghost]);
        db.flush();

        listService.slotContentService.clearBucketMemberSlots(page);
        listService.slotContentService.insertBucketMemberSlotAt(page, listService.slotContentService.getBucketMemberSlotCount(page), ghost);
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'ghost')).toBe(ghost);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        ghost.owner.unholdSlot(ghost);
    });

    it('a slot nothing holds and nothing refilled is let go where the last bucket let it go', () => {
        const { db, cardsService, cards, reserve, handBack } = createFixture();
        const listService = createOIMBucketService<TCardSlot>(db);
        const list = listService.createStoreSlot(db);
        const page = bucketAt(listService, list, 'page');
        listService.slotContentService.writeBucketMemberSlots(page, [reserve('ghost')]);
        handBack();
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(1);

        listService.slotContentService.clearBucketMemberSlots(page);
        // At the write, not at the flush: the bucket was the last thing
        // pointing at it and nothing took a hold.
        expect(cardsService.getSlotCount(cards)).toBe(0);
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });
});

describe('a stale identity does not take the live one under its key with it', () => {
    it('scalar key', () => {
        const { db, cardsService, cards, reserve } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'a' });
        db.flush();
        const stale = cardsService.getSlotByKey(cards, 'c1')!;

        cardsService.slotContentService.deleteEntity(stale);
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(0);

        const live = reserve('c1');
        expect(live).not.toBe(stale);

        expect(() => OIMEffectService.INSTANCE.createEffect(db, [stale], [], () => { /* held */ }))
            .toThrow(/This identity was released/);

        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(live);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    it('composite key', () => {
        const db = new OIMDB();
        const tagsService = createOIMEntityService<{ id: string }>(db, { keyOf: (tag: { id: string }) => tag.id });
        const tags = tagsService.createStoreSlot(db);
        type TPair = { a: string; b: string };
        type TChain = readonly TOIMEntitySlot[];
        type TPairSlot = TOIMEntitySlot<TPair, TChain>;
        type TPairStore = TOIMSlotStoreTree<TPairSlot, TOIMEntitySlot>;
        const tag = (id: string): TOIMEntitySlot<{ id: string }, TOIMStoreKey> =>
            tagsService.holdSlotByKey(tags, id);
        const pairsService = createOIMEntityService<TPair, TOIMEntityColumnName<TPair>, TChain, TPairStore>(db, {
            entitySlotStoreService:
                new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TPairSlot>(
                    OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue(),
                ),
            keyOf: (pair: TPair) => [tag(pair.a), tag(pair.b)],
        });
        const pairs = pairsService.createStoreSlot(db);
        const key: TChain = [tag('x'), tag('y')];
        pairsService.slotContentService.upsertEntity(pairs, { a: 'x', b: 'y' });
        db.flush();
        const stale = pairsService.getSlotByKey(pairs, key)!;

        pairsService.slotContentService.deleteEntity(stale);
        db.flush();
        expect(pairsService.getSlotCount(pairs)).toBe(0);

        const live = pairsService.holdSlotByKey(pairs, key);
        expect(live).not.toBe(stale);

        expect(() => OIMEffectService.INSTANCE.createEffect(db, [stale], [], () => { /* held */ }))
            .toThrow(/This identity was released/);

        expect(pairsService.getSlotByKey(pairs, key)).toBe(live);
        expect(pairsService.getSlotCount(pairs)).toBe(1);
        live.owner.unholdSlot(live);
    });
});

describe('what the release must not quietly break', () => {
    it('a collection nobody reads reclaims what it removes without a frame at all', () => {
        let armed = 0;
        let run: (() => void) | undefined;
        const db = new OIMDB({ channelScheduler: flush => { armed++; run = flush; } });
        const { cardsService, cards } = createFixture(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'a' });
        run?.();
        expect(cardsService.getSlotCount(cards)).toBe(1);

        armed = 0;
        cardsService.slotContentService.deleteEntity(cardsService.getSlotByKey(cards, 'c1')!);
        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(armed).toBe(0);          // nobody is subscribed; nothing needed a frame
        run?.();
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('a value that leaves does not touch what the application keeps in data', () => {
        const { db, cardsService, cards } = createFixture();
        const render = (slot: TOIMEntitySlot<TCard, TOIMStoreKey>): string => {
            const slotEditable = slot as TOIMSlotEditable<typeof slot>;
            const data = (slotEditable.data ??= []);
            data[0] ??= `title=${slot.entity?.title ?? '?'}`;
            return data[0] as string;
        };
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'first' });
        db.flush();

        const slot = cardsService.getSlotByKey(cards, 'c1')!;
        slot.owner.holdSlot(slot);
        expect(render(slot)).toBe('title=first');

        cardsService.slotContentService.deleteEntity(slot);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'second' });
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(slot);   // the hold carried it
        expect(render(slot)).toBe('title=first');
        expect(slot.entity?.title).toBe('second');

        slot.owner.unholdSlot(slot);
    });
});
