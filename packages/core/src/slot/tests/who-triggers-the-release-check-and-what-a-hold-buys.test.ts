import type { TOIMEditable } from '../types/TOIMEditable';

import { OIMDB } from '../../db/OIMDB';
import { createOIMComputedService } from '../../computed/createOIMComputedService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import { OIMSlotTreeStoreService } from '../../store/OIMSlotTreeStoreService';
import { OIMDefaults } from '../../db/OIMDefaults';
import { oimSameValueZeroGuard } from '../utils/oimSameValueZeroGuard';
import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { OIMSlotContentPositionalArrayBucketService } from '../../bucket/OIMSlotContentPositionalArrayBucketService';
import { OIMBucketCommands } from '../../bucket/OIMBucketCommands';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture =(db = new OIMDB()) => {
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
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
    createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TCardSlot>() });

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

    it('letting a derivation go: releases the slot it was reading', () => {
        const { db, cardsService, cards } = createFixture();
        const ranksService = createOIMComputedService<TOIMStoreKey, number>({
            createSources: ({ key: id }) => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)] }),
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
        searchService.slotContentService.writeSlotContent(bucket, [reserve('ghost')]);
        // The bucket holds it, so that is the last thing pointing at the slot —
        // which is what the emptying below is being asked about.
        handBack();
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(1);
        searchService.slotContentService.writeSlotContent(bucket, []);
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });
});

describe('a hold is what carries an identity across a batch that empties it', () => {
    it('remove then re-upsert the same key in one batch keeps ONE identity, if something holds it', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'a' });
        db.flush();

        const resolved = cardsService.getSlotByKey(cards, 'c1')!;
        resolved.owner.holdSlot(resolved);

        cardsService.slotContentService.clearSlotContent(resolved);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'b' });
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(resolved);
        expect(resolved.entity).toEqual({ id: 'c1', title: 'b' });
        expect(cardsService.getSlotCount(cards)).toBe(1);

        resolved.owner.unholdSlot(resolved);
    });

    it('and without one, the removal is the end of that identity', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'a' });
        db.flush();
        const was = cardsService.getSlotByKey(cards, 'c1')!;

        cardsService.slotContentService.clearSlotContent(was);
        // Already gone: the value was the only thing pointing at it, and the
        // question was asked where the value left.
        expect(cardsService.getSlotCount(cards)).toBe(0);

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'b' });
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'c1')).not.toBe(was);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    it('a bucket emptied and refilled by two write in one frame keeps ONE identity, if something holds it', () => {
        const { db, cardsService, cards, reserve } = createFixture();
        const listService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TCardSlot>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
        const list = listService.createStoreSlot(db);
        const page = bucketAt(listService, list, 'page');
        const ghost = reserve('ghost');
        ghost.owner.holdSlot(ghost);
        listService.slotContentService.writeSlotContent(page, [ghost]);
        db.flush();

        listService.slotContentService.writeSlotContent(page, []);
        listService.slotContentService.writeSlotContent(page, [ghost]);
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
        const listService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TCardSlot>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
        const list = listService.createStoreSlot(db);
        const page = bucketAt(listService, list, 'page');
        const ghost = reserve('ghost');
        ghost.owner.holdSlot(ghost);
        listService.slotContentService.writeSlotContent(page, [ghost]);
        db.flush();

        listService.slotContentService.clearSlotContent(page);
        listService.slotContentService.insertBucketMemberSlotAt(page, listService.slotContentService.getBucketMemberSlotCount(page), ghost);
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'ghost')).toBe(ghost);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        ghost.owner.unholdSlot(ghost);
    });

    it('a slot nothing holds and nothing refilled is let go where the last bucket let it go', () => {
        const { db, cardsService, cards, reserve, handBack } = createFixture();
        const listService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TCardSlot>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
        const list = listService.createStoreSlot(db);
        const page = bucketAt(listService, list, 'page');
        listService.slotContentService.writeSlotContent(page, [reserve('ghost')]);
        handBack();
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(1);

        listService.slotContentService.clearSlotContent(page);
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
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'a' });
        db.flush();
        const stale = cardsService.getSlotByKey(cards, 'c1')!;

        cardsService.slotContentService.clearSlotContent(stale);
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(0);

        const live = reserve('c1');
        expect(live).not.toBe(stale);

        expect(() => OIMEffectService.INSTANCE.createEffect(db, () => { /* held */ }, [stale]))
            .toThrow(/This identity was released/);

        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(live);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    it('composite key', () => {
        const db = new OIMDB();
        const tagsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<{ id: string }>(db) });
        const tags = tagsService.createStoreSlot(db);
        type TPair = { a: string; b: string };
        type TChain = readonly TOIMEntitySlot[];
        type TPairSlot = TOIMEntitySlot<TPair, TChain>;
                const tag = (id: string): TOIMEntitySlot<{ id: string }, TOIMStoreKey> =>
            tagsService.holdSlotByKey(tags, id);
        const pairsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TPair, TChain>(db), slotStoreService: new OIMSlotTreeStoreService<TOIMEntitySlot, TPairSlot>(
                    OIMDefaults.COMPOSITE_KEY_TREE_WALK.getValue(),
                ) });
        const pairs = pairsService.createStoreSlot(db);
        const key: TChain = [tag('x'), tag('y')];
        pairsService.writeSlotContentByKey(pairs, ((pair: TPair) => [tag(pair.a), tag(pair.b)])({ a: 'x', b: 'y' }), { a: 'x', b: 'y' });
        db.flush();
        const stale = pairsService.getSlotByKey(pairs, key)!;

        pairsService.slotContentService.clearSlotContent(stale);
        db.flush();
        expect(pairsService.getSlotCount(pairs)).toBe(0);

        const live = pairsService.holdSlotByKey(pairs, key);
        expect(live).not.toBe(stale);

        expect(() => OIMEffectService.INSTANCE.createEffect(db, () => { /* held */ }, [stale]))
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
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'a' });
        run?.();
        expect(cardsService.getSlotCount(cards)).toBe(1);

        armed = 0;
        cardsService.slotContentService.clearSlotContent(cardsService.getSlotByKey(cards, 'c1')!);
        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(armed).toBe(0);          // nobody is subscribed; nothing needed a frame
        run?.();
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('a value that leaves does not touch what the application keeps in data', () => {
        const { db, cardsService, cards } = createFixture();
        const render = (slot: TOIMEntitySlot<TCard, TOIMStoreKey>): string => {
            const editableSlot = slot as TOIMEditable<typeof slot>;
            const data = (editableSlot.data ??= []);
            data[0] ??= `title=${slot.entity?.title ?? '?'}`;
            return data[0] as string;
        };
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'first' });
        db.flush();

        const slot = cardsService.getSlotByKey(cards, 'c1')!;
        slot.owner.holdSlot(slot);
        expect(render(slot)).toBe('title=first');

        cardsService.slotContentService.clearSlotContent(slot);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'second' });
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(slot);   // the hold carried it
        expect(render(slot)).toBe('title=first');
        expect(slot.entity?.title).toBe('second');

        slot.owner.unholdSlot(slot);
    });
});
