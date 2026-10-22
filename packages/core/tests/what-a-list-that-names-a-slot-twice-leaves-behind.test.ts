/**
 * A CALLER'S LIST NAMES THE SAME SLOT TWICE — what the bucket then holds, and
 * what `containsExactly` has to answer about it.
 *
 * `OIMSlotContentBucketService.writeBucketMemberSlots` is ONE `drain` followed by a join loop.
 * There is no per-slot unlink anywhere in it, so a mention is not a move: an
 * ordered service pushes every mention and the bucket ends up holding the
 * caller's list VERBATIM, repeats and all. An
 * `IOIMBucketArrayMembership.containsTheSameSequence` written to the opposite premise —
 * "unlink, then join, so a second mention lifts the slot out of the list and
 * puts it back on the end" — answers from the DISTINCT slots read from the end
 * of the caller's list. On the branch whose ORDER the caller places,
 * `writeBucketMemberSlots` would then decline a list that genuinely changes what a reader
 * sees (`[a, b]` re-sent as `[a, b, b]`), silently, and the caller's list never lands.
 *
 * The three services answer three different questions, and each is right for
 * its own storage, because each `add` records something different: a set
 * records the second mention as nothing, a list records it as a second slot
 * held, and a list the caller orders records it at a second POSITION.
 *
 * Core only.
 */
import { OIMDB } from '../src/factories/OIMDB';
import { OIMChannelService } from '../src/engine/channel/OIMChannelService';
import { OIMSlotContentBucketServiceArrayDriven } from '../src/facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { OIMSlotContentBucketServiceSetDriven } from '../src/facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMBucketArrayMembershipUnique } from '../src/engine/bucket/array/OIMBucketArrayMembershipUnique';
import { createOIMBucketService } from '../src/factories/createOIMBucketService';
import { createOIMEntityService } from '../src/factories/createOIMEntityService';
import type { OIMSlotContentBucketService } from '../src/facade/bucket/OIMSlotContentBucketService';
import type { TOIMEntitySlot } from '../src/engine/entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsArrayUniqueStore } from '../src/engine/bucket/array/types/TOIMBucketSlotsArrayUniqueStore';
import type { TOIMBucketSlotsArrayStore } from '../src/engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketSlotsSetStore } from '../src/engine/bucket/types/TOIMBucketSlotsSetStore';

type Card = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<Card, string>;

const createFixtureOver = <TSlots>(slotContentService: OIMSlotContentBucketService<TCardSlot, TSlots>) => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<Card, 'id' | 'title', string>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMBucketService<
        TCardSlot, string, TSlots, OIMSlotContentBucketService<TCardSlot, TSlots>
    >(db, { slotContentService });
    const byDeck = byDeckService.createStoreSlot(db);
    const card = (id: string): TCardSlot => cardsService.slotContentService.upsertEntity(cards, { id, title: id.toUpperCase() });
    const bucket = byDeckService.holdSlotByKey(byDeck, 'page-1');
    const ids = (): string[] =>
        Array.from(slotContentService.getBucketMemberSlots(bucket)).map(slot => (slot.entity as Card).id);
    const write = jest.spyOn(OIMChannelService.INSTANCE, 'writeWithoutFlushCheck');
    const moves = (): number => write.mock.calls.filter(([, slot]) => slot === bucket).length;
    const resetMoves = (): void => { write.mockClear(); };
    return { cards, cardsService, card, bucket, byDeck, byDeckService, moves, resetMoves, ids };
};

const createFixture = <TSlots extends TOIMBucketSlotsArrayStore<TCardSlot>>(
    slotContentService: OIMSlotContentBucketServiceArrayDriven<TCardSlot, TSlots>,
) => createFixtureOver<TSlots>(slotContentService);

const createSetFixture = (slotContentService: OIMSlotContentBucketServiceSetDriven<TCardSlot>) =>
    createFixtureOver<TOIMBucketSlotsSetStore<TCardSlot>>(slotContentService);

afterEach(() => {
    jest.restoreAllMocks();
});

describe('a list read as the caller sent it, on the branch whose order is the caller\'s', () => {
    it('leaves every mention where it was named, and not a deduplicated list', () => {
        const service = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();
        const { card, bucket, byDeckService, ids } = createFixture<TOIMBucketSlotsArrayStore<TCardSlot>>(service);
        const k3 = card('k3');

        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [card('k1'), k3, card('k2'), k3]);

        // The caller's list, verbatim. `writeBucketMemberSlots` does one `drain` and then
        // joins each mention, so nothing lifts the first `k3` out.
        expect(ids()).toEqual(['k1', 'k3', 'k2', 'k3']);
        // Two mentions are two slots held, and each takes its own hold.
        expect(k3.holdCount).toBe(2);
    });

    it('is not woken by that same list re-sent', () => {
        const service = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();
        const { card, bucket, byDeckService, moves, resetMoves, ids } = createFixture<TOIMBucketSlotsArrayStore<TCardSlot>>(service);
        const k3 = card('k3');
        const sent = [card('k1'), k3, card('k2'), k3];

        byDeckService.slotContentService.writeBucketMemberSlots(bucket, sent);
        resetMoves();
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, sent.slice());

        expect({ moves: moves(), ids: ids() })
            .toEqual({ moves: 0, ids: ['k1', 'k3', 'k2', 'k3'] });
    });

    it('IS a change when the repeat is dropped, because a reader sees three rows instead of four', () => {
        const service = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();
        const { card, bucket, byDeckService, moves, resetMoves, ids } = createFixture<TOIMBucketSlotsArrayStore<TCardSlot>>(service);
        const k1 = card('k1');
        const k2 = card('k2');
        const k3 = card('k3');

        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [k1, k3, k2, k3]);
        resetMoves();
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [k1, k3, k2]);

        expect(ids()).toEqual(['k1', 'k3', 'k2']);
        expect(moves()).toBeGreaterThan(0);
        expect(k3.holdCount).toBe(1);
    });

    /**
     * THE ONE A DISTINCT-FROM-THE-END WALK LOSES. `[a, b]` re-sent as `[a, b, b]`
     * is a bucket that renders three rows instead of two; matching `b` once and
     * passing over the second mention reports the list as the one already held,
     * so the write never lands and nobody is told.
     */
    it('lands a repeat added to a list that had none', () => {
        const service = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();
        const { card, bucket, byDeckService, moves, resetMoves, ids } = createFixture<TOIMBucketSlotsArrayStore<TCardSlot>>(service);
        const a = card('a');
        const b = card('b');

        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [a, b]);
        resetMoves();
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [a, b, b]);

        expect(ids()).toEqual(['a', 'b', 'b']);
        expect(moves()).toBeGreaterThan(0);
        expect(b.holdCount).toBe(2);
    });
});

describe('a list read as the caller sent it, once each, on the deduplicating service', () => {
    it('keeps the FIRST mention\'s position, because that is the one `add` let through', () => {
        const service = new OIMSlotContentBucketServiceArrayDriven<TCardSlot, TOIMBucketSlotsArrayUniqueStore<TCardSlot>>({
            bucketArrayMembership: new OIMBucketArrayMembershipUnique<TCardSlot>(),
        });
        const { card, bucket, byDeckService, moves, resetMoves, ids } = createFixture<TOIMBucketSlotsArrayUniqueStore<TCardSlot>>(service);
        const a = card('a');
        const b = card('b');

        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [b, a, b]);
        expect(ids()).toEqual(['b', 'a']);
        expect(b.holdCount).toBe(1);

        resetMoves();
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [b, a, b]);
        expect({ moves: moves(), ids: ids() }).toEqual({ moves: 0, ids: ['b', 'a'] });
    });

    it('is still reordered by a list that names the same slots in another order', () => {
        const service = new OIMSlotContentBucketServiceArrayDriven<TCardSlot, TOIMBucketSlotsArrayUniqueStore<TCardSlot>>({
            bucketArrayMembership: new OIMBucketArrayMembershipUnique<TCardSlot>(),
        });
        const { card, bucket, byDeckService, moves, resetMoves, ids } = createFixture<TOIMBucketSlotsArrayUniqueStore<TCardSlot>>(service);
        const a = card('a');
        const b = card('b');

        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [a, b]);
        resetMoves();
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [b, a]);

        expect(ids()).toEqual(['b', 'a']);
        expect(moves()).toBeGreaterThan(0);
    });
});

describe('a list read as a set, on the service that records no second mention', () => {
    it('holds the slot once for two mentions and is not woken by the list re-sent', () => {
        const service = new OIMSlotContentBucketServiceSetDriven<TCardSlot>();
        const { card, bucket, byDeckService, moves, resetMoves } = createSetFixture(service);
        const a = card('a');

        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [a, a]);
        resetMoves();
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [a, a]);

        expect({ moves: moves(), size: byDeckService.slotContentService.getBucketMemberSlotCount(bucket), holds: a.holdCount })
            .toEqual({ moves: 0, size: 1, holds: 1 });
    });

    it('answers the same list in another order as the slots it already holds', () => {
        const service = new OIMSlotContentBucketServiceSetDriven<TCardSlot>();
        const { card, bucket, byDeckService, moves, resetMoves } = createSetFixture(service);
        const a = card('a');
        const b = card('b');

        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [a, b]);
        resetMoves();
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [b, a]);

        expect(moves()).toBe(0);
    });
});
