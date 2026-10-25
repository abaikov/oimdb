import { setFlagsFromString } from 'node:v8';

import { OIMDB, OIMEffectService, OIMSlotContentSetBucketService, OIMSlotAfterUnholdReleasePolicy, createOIMEntityWriterInPlace, createOIMEntityWriterReplacing, createOIMSlotCollectionIndexService } from '../src/index';
import type { IOIMEntityWriter, TOIMDBOptions } from '../src/index';
import type { TOIMEntitySlot } from '../src/engine/entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../src/index';
import { createOIMSlotCollectionService } from '../src/index';
import { createOIMSingleSlotService } from '../src/index';
import { createOIMSingleComputedService } from '../src/index';

setFlagsFromString('--allow-natives-syntax');
const hasFastProperties = new Function('o', 'return %HasFastProperties(o)') as (o: object) => boolean;
const haveSameMap = new Function('a', 'b', 'return %HaveSameMap(a, b)') as (a: object, b: object) => boolean;

type TCard = { id: string; deck: string; rank: number; note?: string };

const CARDS = 50;

const slotOwnerServiceOf = (collectionService: object): object =>
    (collectionService as unknown as { slotOwnerService: object }).slotOwnerService;

const exercise = (dbOptions: TOIMDBOptions) => {
    const db = new OIMDB(dbOptions);
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService(db, {
        entityService: cardsService,
        keyOf: (card: TCard) => card.deck,
        slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot<TCard>>(),
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    for (let i = 0; i < CARDS; i++) {
        cardsService.writeSlotContentByKey(cards, `c${i}`, { id: `c${i}`, deck: `d${i % 5}`, rank: i, note: 'n' });
    }
    const cardSlot = cardsService.holdSlotByKey(cards, 'c1');
    cardSlot.owner.unholdSlot(cardSlot);
    const topService = createOIMSingleComputedService<number>();
    const top = topService.createComputedStoreSlot(
        db,
        () => cardsService.getSlotByKey(cards, 'c2').entity?.rank ?? 0,
        () => ({ sourceSlots: [cardsService.getSlotByKey(cards, 'c2')], sourceComputeds: [] }),
    );
    const effect = effectService.createEffect(
        db,
        [cardsService.getSlotByKey(cards, 'c3'), byDeckService.getSlotByKey(byDeck, 'd0')],
        [topService.computedSingleSlotService.getSingleSlot(top)], () => undefined,
    );
    db.flush();
    cardsService.writeSlotContentByKey(cards, 'c3', { id: 'c3', deck: 'd1', rank: 1.5 });
    const c5Slot = cardsService.findSlotByKey(cards, 'c5');
    if (c5Slot !== undefined) cardsService.slotContentService.updateEntity(c5Slot, { rank: 7 });
    db.flush();
    effectService.disposeEffect(effect);
    db.flush();
    const entitySlots = Array.from({ length: CARDS }, (_, i) => cardsService.getSlotByKey(cards, `c${i}`));
    const bucketSlots = Array.from({ length: 5 }, (_, d) => byDeckService.getSlotByKey(byDeck, `d${d}`));
    const columnSlots = [
        cardsService.columnSlotService.holdColumn(entitySlots[6], 'rank'), cardsService.columnSlotService.holdColumn(entitySlots[7], 'deck'),
        byDeckService.holdBucketColumnByKey(byDeck, 'd1', 'rank'),
    ];
    cardsService.columnSlotService.unholdColumn(cardsService.columnSlotService.holdColumn(entitySlots[8], 'note'));
    return { db, cards, cardsService, byDeck, byDeckService, top, topService, entitySlots, bucketSlots, columnSlots };
};

const oneFastMap = (objects: readonly object[]): void => {
    for (const object of objects) {
        expect(hasFastProperties(object)).toBe(true);
        expect(haveSameMap(object, objects[0])).toBe(true);
    }
};

const dbOptionsByPolicy: [string, () => TOIMDBOptions][] = [
    ['no policy', () => ({})],
    ['a deadline written into the slot', () => ({
        slotReleasePolicy: new OIMSlotAfterUnholdReleasePolicy({ keepAfterUnholdMs: 60_000 }),
        getNowMs: () => 1_760_000_000_000,
        releaseTimer: () => () => undefined,
    })],
];

describe.each(dbOptionsByPolicy)('what V8 keeps on fast properties, under %s', (_, dbOptionsFor) => {
    it('every entity slot, after holds, an effect, a move between buckets and a patch, shares one fast map', () => {
        oneFastMap(exercise(dbOptionsFor()).entitySlots);
    });

    it('every bucket slot shares one fast map', () => {
        oneFastMap(exercise(dbOptionsFor()).bucketSlots);
    });

    it('every column slot, on an entity slot or a bucket slot, shares one fast map', () => {
        oneFastMap(exercise(dbOptionsFor()).columnSlots);
    });

    it('the computed slot, the channel, the collection, the index and the root stay on fast properties', () => {
        const { db, cards, cardsService, byDeck, byDeckService, top, topService } = exercise(dbOptionsFor());
        for (const object of [
            topService.computedSingleSlotService.getSingleSlot(top), db.defaultChannelSlot, db, top,
            slotOwnerServiceOf(topService.computedSingleSlotService), topService.computedSingleSlotService.slotContentService,
            cards, cardsService, slotOwnerServiceOf(cardsService),
            byDeck, byDeckService, byDeckService.slotContentService, slotOwnerServiceOf(byDeckService),
        ]) {
            expect(hasFastProperties(object)).toBe(true);
        }
    });
});

const writers: [string, () => IOIMEntityWriter][] = [
    ['in place', createOIMEntityWriterInPlace],
    ['replacing', createOIMEntityWriterReplacing],
];

describe.each(writers)('what V8 keeps on fast properties, an entity written %s', (_, createWriter) => {
    it('stays fast after an upsert that drops a column', () => {
        const db = new OIMDB({ entityWriter: createWriter() });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'd1', rank: 1, note: 'n' });

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'd1', rank: 2 });

        expect(hasFastProperties(cardsService.getSlotByKey(cards, 'c1').entity as object)).toBe(true);
    });

    it('stays fast after a patch that adds a column', () => {
        const db = new OIMDB({ entityWriter: createWriter() });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'd1', rank: 1 });

        cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c1'), { note: 'n' });

        expect(hasFastProperties(cardsService.getSlotByKey(cards, 'c1').entity as object)).toBe(true);
    });

    it('stays fast at forty columns after an upsert that drops one and after deleteEntityColumns', () => {
        const wide = (skipped: string): Record<string, unknown> => Object.fromEntries([
            ['id', 'w'], ...Array.from({ length: 40 }, (_, i) => [`f${i}`, i]).filter(([name]) => name !== skipped),
        ]);
        const db = new OIMDB({ entityWriter: createWriter() });
        const itemsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<Record<string, unknown>>(db) });
        const items = itemsService.createStoreSlot(db);
        itemsService.writeSlotContentByKey(items, (item => item.id as string)(wide('')), wide(''));
        itemsService.writeSlotContentByKey(items, (item => item.id as string)(wide('f0')), wide('f0'));
        const recordService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<Record<string, unknown>>(db, { entityWriter: createWriter() }) });
        const record = recordService.createStoreSlot(db);
        recordService.writeSingleSlotContent(record, wide(''));
        recordService.slotContentService.deleteEntityColumns(recordService.getSingleSlot(record), ['f1']);

        expect(hasFastProperties(itemsService.getSlotByKey(items, 'w').entity as object)).toBe(true);
        expect(hasFastProperties(recordService.getSingleSlot(record).entity as object)).toBe(true);
    });

    it('stays fast after columns are taken away from a standalone record', () => {
        const db = new OIMDB();
        const recordService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db, { entityWriter: createWriter() }) });
        const record = recordService.createStoreSlot(db);
        recordService.writeSingleSlotContent(record, { id: 'c1', deck: 'd1', rank: 1, note: 'n' });

        recordService.slotContentService.deleteEntityColumns(recordService.getSingleSlot(record), ['note', 'rank']);

        expect(hasFastProperties(recordService.getSingleSlot(record).entity as object)).toBe(true);
    });
});
