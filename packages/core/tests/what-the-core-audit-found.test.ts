import {
    createOIMColumnGroup,
    OIMChannelService, OIMDB, OIMSlotContentChangeListenerService, OIMDefaults, OIMEffectService, OIMSetBucketContentService, OIMSlotAfterWriteReleasePolicy,
    createOIMEntitySlotCollectionStoreAggregate, createOIMSortedComputedService, createOIMEntityContentService, createOIMSlotCollectionIndexService,
    createOIMSlotCollectionService, isOIMSlotReleased, mintOIMAfterWriteSlotReleaseWheel, OIM_SLICE_LENGTH_MS,
} from '@oimdb/core';
import type { TOIMEffect, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';

type TCard = { id: string; deck: string; title: string; rank: number };

describe('what the core audit found', () => {
    it('an effect that stops itself in the middle of a run holds nothing it read in that run', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        const flag = cards.holdSlotByKey('flag');
        flag.writeSlotContent({ id: 'flag', deck: 'a', title: '', rank: 0 });
        const a = cards.holdSlotByKey('a');
        a.writeSlotContent({ id: 'a', deck: '', title: '', rank: 0 });
        const b = cards.holdSlotByKey('b');
        b.writeSlotContent({ id: 'b', deck: '', title: '', rank: 0 });
        db.flush();
        const ownEffect: { effect: TOIMEffect | undefined } = { effect: undefined };
        ownEffect.effect = OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            if (flag.entity?.deck === 'a') { void a.entity; return; }
            void b.entity;
            if (ownEffect.effect !== undefined) OIMEffectService.INSTANCE.disposeEffect(ownEffect.effect);
        });
        flag.updateEntity({ deck: 'b' });
        db.flush();
        expect(b.holdCount).toBe(1);
    });

    it('an effect that moves a slot to a column-filtered edge still wakes on that column', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const a = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'first', title: '', rank: 0 });
        const s = cardsService.writeSlotContentByKey(cards, 's', { id: 's', deck: '', title: 't', rank: 0 });
        const b = cardsService.writeSlotContentByKey(cards, 'b', { id: 'b', deck: '', title: '', rank: 0 });
        const titleGroup = createOIMColumnGroup<keyof TCard>(['title']);
        db.flush();
        let runs = 0;
        const phase = { isMoved: false };
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            runs++;
            if (!phase.isMoved) { void a.entity; void s.entity; return; }
            void s.getEntity(titleGroup);
            void b.entity;
        });
        phase.isMoved = true;
        cardsService.slotContentService.updateEntity(s, { deck: 'moved' });
        db.flush();
        const runsAfterMove = runs;
        cardsService.slotContentService.updateEntityColumn(s, 'title', 'changed');
        db.flush();
        expect(runs).toBe(runsAfterMove + 1);
    });

    it('a disposed index leaves no column read on its source after a late bucket column read', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard, TOIMStoreKey>, string>(),
            selectKey: (card: TCard) => card.deck,
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.disposeIndexStoreSlot(byDeck);
        expect(() => byDeckService.getAnyBucketColumnSlotByKey(byDeck, 'x')).toThrow();
        expect(cards.allColumnsListenerCount).toBe(0);
    });

    it('a column the collection did not declare leaves the entity releasable', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db, { columnNames: ['title'] });
        const card = cards.holdSlotByKey('c');
        card.writeSlotContent({ id: 'c', deck: '', title: 't', rank: 1 });
        expect(() => card.getColumnSlot('rank')).toThrow();
        expect(card.columnSlotStore).toBeUndefined();
    });

    it('a write to a slot inside a db effect does not make the effect depend on what it wrote', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        cards.writeSlotContentByKey('c', { id: 'c', deck: '', title: 't', rank: 1 });
        db.flush();
        let runs = 0;
        db.createEffect(() => { runs++; cards.peekSlotByKey('c')?.updateEntity({ rank: runs }); });
        db.flush();
        expect(() => db.flush()).not.toThrow();
        expect(runs).toBe(1);
    });

    it('an empty list written to a new bucket key hands back a slot that is still alive', () => {
        const db = new OIMDB();
        const bucketsService = createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService() });
        const buckets = bucketsService.createStoreSlot(db);
        const bucket = bucketsService.writeSlotContentByKey(buckets, 'k', []);
        expect(isOIMSlotReleased(bucket)).toBe(false);
    });

    it('a dropped database leaves no release wheel armed', () => {
        const disposed: number[] = [];
        const releaseTimer = (_run: () => void, inMs: number) => { const at = disposed.length; disposed.push(inMs); return () => { disposed[at] = -1; }; };
        const defaults = new OIMDefaults({ slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 30_000 }) });
        const db = new OIMDB({ releaseTimer });
        const rowsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard, string>({ defaults }) });
        const rows = rowsService.createStoreSlot(db);
        rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', deck: '', title: '', rank: 0 });
        db.flush();
        expect(disposed.some(inMs => inMs >= 0)).toBe(true);
        OIMChannelService.INSTANCE.dropChannelSlot(db.defaultChannelSlot);
        expect(disposed.every(inMs => inMs === -1)).toBe(true);
    });

    it('a release due inside the next slice is armed for the end of that slice, not one slice later', () => {
        let nowMs = 0;
        const armedAtMs: number[] = [];
        const releaseTimer = (_run: () => void, inMs: number) => { armedAtMs.push(nowMs + inMs); return () => undefined; };
        const defaults = new OIMDefaults({ slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 100 }) });
        const db = new OIMDB({ getNowMs: () => nowMs, releaseTimer });
        const afterWriteSlotReleaseWheel = mintOIMAfterWriteSlotReleaseWheel(db.collectorSlot);
        const rowsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard, string>({ defaults }) });
        const rows = rowsService.createStoreSlot(db);
        rowsService.writeSlotContentByKey(rows, 'early', { id: 'early', deck: '', title: '', rank: 0 });
        nowMs = 1500;
        rowsService.writeSlotContentByKey(rows, 'late', { id: 'late', deck: '', title: '', rank: 0 });
        db.flush();
        nowMs = OIM_SLICE_LENGTH_MS;
        armedAtMs.length = 0;
        afterWriteSlotReleaseWheel.flush();
        expect(Math.min(...armedAtMs)).toBeLessThanOrEqual(2 * OIM_SLICE_LENGTH_MS);
    });

    it('a slot queued in a batch is not released before the batch hands it to its listeners', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const releasedWhenHeard: boolean[] = [];
        const hear = (slot: { slotFlags: number }) => { releasedWhenHeard.push(isOIMSlotReleased(slot as never)); };
        OIMSlotContentChangeListenerService.INSTANCE.addContentChangeListener(cards, {
            onContentChanged: slot => { hear(slot); },
            onManyContentsChanged: slots => { for (let i = 0; i < slots.getEntryCount(); i++) hear(slots.getEntryAt(i)); },
        }, undefined);
        cardsService.writeInBatch(cards, () => {
            const card = cardsService.getSlotByKey(cards, 'c');
            card.writeSlotContent({ id: 'c', deck: '', title: '', rank: 0 });
            card.clearSlotContent();
            db.flush();
        });
        expect(releasedWhenHeard.length).toBeGreaterThan(0);
        expect(releasedWhenHeard.every(isReleased => !isReleased)).toBe(true);
    });

    it('a batch opened by a listener on the same store slot is delivered once', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const heardKeys: string[] = [];
        let isEchoed = false;
        OIMSlotContentChangeListenerService.INSTANCE.addContentChangeListener(cards, {
            onContentChanged: slot => { heardKeys.push(String(slot.key)); },
            onManyContentsChanged: slots => {
                for (let i = 0; i < slots.getEntryCount(); i++) heardKeys.push(String(slots.getEntryAt(i).key));
                if (isEchoed) return;
                isEchoed = true;
                cardsService.writeInBatch(cards, () => {
                    cardsService.writeSlotContentByKey(cards, 'x', { id: 'x', deck: '', title: '', rank: 0 });
                    cardsService.writeSlotContentByKey(cards, 'y', { id: 'y', deck: '', title: '', rank: 0 });
                });
            },
        }, undefined);
        cardsService.writeInBatch(cards, () => {
            cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: '', title: '', rank: 0 });
            cardsService.writeSlotContentByKey(cards, 'b', { id: 'b', deck: '', title: '', rank: 0 });
        });
        expect(heardKeys.sort()).toEqual(['a', 'b', 'x', 'y']);
    });

    it('a sorted bucket follows a member swapped in by hand', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService({ entityService: cardsService, selectKey: (card: TCard) => card.deck });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'd', title: '', rank: 1 });
        const b = cardsService.writeSlotContentByKey(cards, 'b', { id: 'b', deck: 'd', title: '', rank: 2 });
        const c = cardsService.writeSlotContentByKey(cards, 'c', { id: 'c', deck: 'other', title: '', rank: 3 });
        const sortedService = createOIMSortedComputedService({ indexService: byDeckService, sortColumns: [{ columnName: 'rank', direction: 'asc' }] });
        const sorted = sortedService.createSortedStoreSlot(byDeck);
        const sortedSlot = sortedService.holdSlotByKey(sorted, 'd');
        const bucket = byDeckService.holdSlotByKey(byDeck, 'd');
        db.flush();
        expect(sortedSlot.value.map(slot => slot.key)).toEqual(['a', 'b']);
        bucket.removeBucketMemberSlot(b);
        bucket.addBucketMemberSlot(c);
        db.flush();
        expect(sortedSlot.value.map(slot => slot.key)).toEqual(['a', 'c']);
    });

    it('an effect that reads many slots in a new order twice each holds every slot once', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        const slots = Array.from({ length: 40 }, (_, i) => cards.writeSlotContentByKey(`c${i}`, { id: `c${i}`, deck: '', title: '', rank: i }));
        db.flush();
        const order = { isReversed: false };
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            const read = order.isReversed ? [...slots].reverse() : slots;
            for (const slot of read) { void slot.entity; void slot.entity; }
        });
        order.isReversed = true;
        slots[0].updateEntity({ rank: -1 });
        db.flush();
        expect(slots.every(slot => slot.holdCount === 1)).toBe(true);
    });

    it('types a slot column read by the columns the collection declared', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard, 'title'>(db, { columnNames: ['title'] });
        const card = cards.holdSlotByKey('c');
        card.writeSlotContent({ id: 'c', deck: '', title: 't', rank: 1 });
        const readUndeclaredColumn = () => {
            // @ts-expect-error rank is not a declared column
            card.getColumnSlot('rank');
        };
        expect(typeof readUndeclaredColumn).toBe('function');
        expect(card.getColumnSlot('title')).toBeDefined();
    });

    it('a keep window longer than a timer can wait is armed within the timer limit', () => {
        const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
        try {
            const defaults = new OIMDefaults({ slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 30 * 24 * 3600_000 }) });
            const db = new OIMDB();
            const rowsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard, string>({ defaults }) });
            const rows = rowsService.createStoreSlot(db);
            rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', deck: '', title: '', rank: 0 });
            db.flush();
            const delays = setTimeoutSpy.mock.calls.map(call => call[1] ?? 0);
            expect(delays.length).toBeGreaterThan(0);
            expect(Math.max(...delays)).toBeLessThanOrEqual(2 ** 31 - 1);
        } finally {
            setTimeoutSpy.mockRestore();
        }
    });
});
