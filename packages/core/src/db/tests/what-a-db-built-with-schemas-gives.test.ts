import { OIMDB } from '../OIMDB';
import { createOIMEntitySlotCollectionStoreAggregate } from '../../entity/createOIMEntitySlotCollectionStoreAggregate';
import { createOIMSlotCollectionIndexStoreAggregate } from '../../index/createOIMSlotCollectionIndexStoreAggregate';
import { createOIMSingleSourceTrackingComputedService } from '../../computed/createOIMSingleSourceTrackingComputedService';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TCard = { id: string; deck: string; title: string; rank: number };
type TConnection = { isOnline: boolean };

const createConnectionSchema = (db: OIMDB) => ({
    connections: createOIMEntitySlotCollectionStoreAggregate<TConnection>(db),
});

const createCardSchema = (db: OIMDB, connectionSchema: ReturnType<typeof createConnectionSchema>) => {
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    const byDeck = createOIMSlotCollectionIndexStoreAggregate(cards, { keyOf: (card) => card.deck });
    const visibleSpadeCountService = createOIMSingleSourceTrackingComputedService<number>({
        derive: () => (connectionSchema.connections.getSlotByKey('self').entity?.isOnline === true
            ? byDeck.getSlotByKey('spades').getBucketMemberSlotCount() : 0),
        initialValue: 0,
    });
    const visibleSpadeCount = visibleSpadeCountService
        .createStoreAggregate(visibleSpadeCountService.createStoreSlot(db));
    return { cards, byDeck, visibleSpadeCount };
};

const createAppDB = () => new OIMDB({
    createSchemas: (db) => {
        const connection = createConnectionSchema(db);
        return { connection, default: createCardSchema(db, connection) };
    },
});

describe('what a db built with schemas gives', () => {
    it('builds every schema on itself, once, and a schema reads another one', () => {
        const db = createAppDB();
        const schema = db.schemas.default;
        schema.cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        db.schemas.connection.connections.writeSlotContentByKey('self', { isOnline: true });
        db.flush();
        expect(schema.cards.storeSlot.channelSlot).toBe(db.defaultChannelSlot);
        expect(schema.byDeck.getEntitiesByKey('spades').map((card) => card.title)).toEqual(['Ace']);
        expect(schema.visibleSpadeCount.getSingleSlot().value).toBe(1);
        expect(db.schemas).toBe(db.schemas);
    });

    it('keeps two dbs of the same schemas apart', () => {
        const left = createAppDB();
        const right = createAppDB();
        left.schemas.default.cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        left.flush();
        right.flush();
        expect(left.schemas.default.cards.getEntityCount()).toBe(1);
        expect(right.schemas.default.cards.getEntityCount()).toBe(0);
        expect(left.schemas.default.cards).not.toBe(right.schemas.default.cards);
    });

    it('has no schemas when it was given none', () => {
        expect(new OIMDB().schemas).toBeUndefined();
    });

    it('lets a schema computed go when nobody holds it, and derives it again on the next read', () => {
        const db = createAppDB();
        db.schemas.connection.connections.writeSlotContentByKey('self', { isOnline: true });
        db.flush();
        const firstSlot = db.schemas.default.visibleSpadeCount.getSingleSlot();
        expect(firstSlot.value).toBe(0);
        db.flush();
        expect(oimIsSlotReleased(firstSlot)).toBe(true);
        db.schemas.default.cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        db.flush();
        expect(db.schemas.default.visibleSpadeCount.getSingleSlot().value).toBe(1);
    });

    it('runs a tracking effect on itself and stops it', () => {
        const db = createAppDB();
        const cards = db.schemas.default.cards;
        const titles: string[] = [];
        const stop = db.createEffect(() => { titles.push(cards.getSlotByKey('c1').entity?.title ?? '-'); });
        cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        db.flush();
        stop();
        cards.getSlotByKey('c1').updateEntity({ title: 'gone' });
        db.flush();
        expect(titles).toEqual(['-', 'Ace']);
    });

    it('runs a static effect at once on its named sources, and runs its cleanup on every rerun and on stop', () => {
        const db = createAppDB();
        const cards = db.schemas.default.cards;
        const ace = cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        const two = cards.writeSlotContentByKey('c2', { id: 'c2', deck: 'hearts', title: 'Two', rank: 2 });
        db.flush();
        const runs: string[] = [];
        const stop = db.createEffect(() => {
            runs.push(`run ${ace.entity?.rank}`);
            return () => { runs.push('cleanup'); };
        }, [ace]);
        two.updateEntity({ rank: 3 });
        db.flush();
        ace.updateEntity({ rank: 5 });
        db.flush();
        stop();
        expect(runs).toEqual(['run 1', 'cleanup', 'run 5', 'cleanup']);
    });

    it('waits for the first change when a static effect is lazy, and keeps a once-only effect for an empty list', () => {
        const db = createAppDB();
        const ace = db.schemas.default.cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        db.flush();
        const runs: string[] = [];
        db.createEffect(() => { runs.push(`lazy ${ace.entity?.rank}`); }, [ace], { lazy: true });
        const stopOnce = db.createEffect(() => { runs.push('once'); return () => { runs.push('once gone'); }; }, []);
        ace.updateEntity({ rank: 2 });
        db.flush();
        stopOnce();
        expect(runs).toEqual(['once', 'lazy 2', 'once gone']);
    });
});

describe('what a disposed db does', () => {
    it('runs no effect and delivers nothing after it is disposed', () => {
        const db = createAppDB();
        const cards = db.schemas.default.cards;
        const titles: string[] = [];
        db.createEffect(() => { titles.push(cards.getSlotByKey('c1').entity?.title ?? '-'); });
        cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        db.flush();
        db.dispose();
        cards.getSlotByKey('c1').updateEntity({ title: 'gone' });
        db.flush();
        expect(titles).toEqual(['-', 'Ace']);
    });
});
