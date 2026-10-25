import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { OIMSlotAfterUnholdReleasePolicy } from '../../../engine/collector/OIMSlotAfterUnholdReleasePolicy';
import { oimMintAfterUnholdSlotReleaseWheel } from '../../../engine/collector/utils/oimMintAfterUnholdSlotReleaseWheel';
import { oimMintAfterWriteSlotReleaseWheel } from '../../../engine/collector/utils/oimMintAfterWriteSlotReleaseWheel';
import { OIMSlotAfterWriteReleasePolicy } from '../../../engine/collector/OIMSlotAfterWriteReleasePolicy';
import { OIMSlotEarliestReleasePolicy } from '../../../engine/collector/OIMSlotEarliestReleasePolicy';
import { OIMSlotAtEmptyReleasePolicy } from '../../../engine/collector/OIMSlotAtEmptyReleasePolicy';
import { OIMSlotNeverReleasePolicy } from '../../../engine/collector/OIMSlotNeverReleasePolicy';
import { OIM_SLICE_LENGTH_MS } from '../../../engine/collector/constants/OIM_SLICE_LENGTH_MS';
import type { IOIMSlotReleasePolicy } from '../../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../../factories/createOIMSingleComputedService';

type Card = { id: string; rank: number };

const START = 1_000_000;
const SHORT = 10_000;
const LONG = 60_000;

type TClock = { now: () => number; at: (ms: number) => void };

const createFixture = (slotReleasePolicyFor?: (clock: TClock) => IOIMSlotReleasePolicy) => {
    let ms = START;
    const clock: TClock = { now: () => ms, at: (value: number): void => { ms = value; } };
    const db = new OIMDB({ getNowMs: clock.now, releaseTimer: () => () => undefined });
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<Card, string>(db) });
    const cards = cardsService.createStoreSlot(db);
    cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', rank: 1 });
    db.flush();
    const card = cardsService.getSlotByKey(cards, 'a');
    let builds = 0;
    let derives = 0;
    const rankComputedService = createOIMSingleComputedService<number>({ slotReleasePolicy: slotReleasePolicyFor?.(clock) });
    const rank = rankComputedService.createComputedStoreSlot(
        db,
        () => {
            derives++;
            return cardsService.getSlotByKey(cards, 'a').entity?.rank ?? -1;
        },
        () => {
            builds++;
            return { sourceSlots: [cardsService.getSlotByKey(cards, 'a')] };
        },
    );
    const rankCollectionService = rankComputedService.computedSingleSlotService;
    const rankService = {
        holdSingleSlot: (storeSlot: typeof rank) => rankCollectionService.holdSingleSlot(storeSlot),
        getSingleSlot: (storeSlot: typeof rank) => rankCollectionService.getSingleSlot(storeSlot),
        getSingleValue: (storeSlot: typeof rank) => {
            const computedSlot = rankCollectionService.getSingleSlot(storeSlot);
            return computedSlot.computedValueService.getValueForSlot(computedSlot);
        },
    };
    return { db, effectService, cardsService, cards, card, rankService, rank, clock, builds: () => builds, derives: () => derives };
};

const afterUnhold = (keepAfterUnholdMs: number) => ({
    policyFor: (_clock: TClock): IOIMSlotReleasePolicy => new OIMSlotAfterUnholdReleasePolicy({ keepAfterUnholdMs }),
    flush: (db: OIMDB): void => {
        oimMintAfterUnholdSlotReleaseWheel(db.collectorSlot).flush();
    },
});

const afterWrite = (keepAfterWriteMs: number) => ({
    policyFor: (_clock: TClock): IOIMSlotReleasePolicy => new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs }),
    flush: (db: OIMDB): void => {
        oimMintAfterWriteSlotReleaseWheel(db.collectorSlot).flush();
    },
});

describe('a computed under the default policy', () => {
    it('goes at the last unhold, gives back its source, and the next read builds a new one', () => {
        const { cardsService, cards, card, rankService, rank, builds } = createFixture();
        const first = rankService.holdSingleSlot(rank);
        expect(card.holdCount).toBe(1);

        first.owner.unholdSlot(first);

        expect(oimIsSlotReleased(first)).toBe(true);
        expect(card.holdCount).toBe(0);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', rank: 4 });
        expect(rankService.getSingleValue(rank)).toBe(4);
        expect(builds()).toBe(2);
    });

    it('lives under an effect whatever the holds, and goes when the effect detaches', () => {
        const { db,effectService, card, rankService, rank } = createFixture();
        const effect = effectService.createEffect(db, [], [rankService.getSingleSlot(rank)], () => undefined);
        const subscribed = rankService.getSingleSlot(rank);
        db.flush();
        expect(oimIsSlotReleased(subscribed)).toBe(false);

        effectService.disposeEffect(effect);

        expect(oimIsSlotReleased(subscribed)).toBe(true);
        expect(card.holdCount).toBe(0);
    });
});

describe('a computed kept after its last unhold', () => {
    it('stays for the window, keeps its source held, and hands the same slot to the next reader', () => {
        const keep = afterUnhold(LONG);
        const { card, rankService, rank } = createFixture(keep.policyFor);
        const first = rankService.holdSingleSlot(rank);
        first.owner.unholdSlot(first);

        expect(oimIsSlotReleased(first)).toBe(false);
        expect(card.holdCount).toBe(1);
        expect(rankService.holdSingleSlot(rank)).toBe(first);
    });

    it('survives the flush that gives back a getter read, without deriving again', () => {
        const keep = afterUnhold(LONG);
        const { db,rankService, rank, derives } = createFixture(keep.policyFor);
        const first = rankService.getSingleSlot(rank);
        expect(rankService.getSingleValue(rank)).toBe(1);

        db.flush();

        expect(oimIsSlotReleased(first)).toBe(false);
        expect(rankService.getSingleSlot(rank)).toBe(first);
        expect(rankService.getSingleValue(rank)).toBe(1);
        expect(derives()).toBe(1);
    });

    it('goes once the window has run out, and gives its source back', () => {
        const keep = afterUnhold(LONG);
        const { db, card, rankService, rank, clock } = createFixture(keep.policyFor);
        const first = rankService.holdSingleSlot(rank);
        first.owner.unholdSlot(first);

        clock.at(START + LONG + 1);
        keep.flush(db);

        expect(oimIsSlotReleased(first)).toBe(true);
        expect(card.holdCount).toBe(0);
    });

    it('reads a root deleted and written again inside the window', () => {
        const keep = afterUnhold(LONG);
        const { cardsService, cards, rankService, rank } = createFixture(keep.policyFor);
        expect(rankService.getSingleValue(rank)).toBe(1);

        const cardSlot = cardsService.findSlotByKey(cards, 'a');
        if (cardSlot !== undefined) cardsService.slotContentService.clearSlotContent(cardSlot);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', rank: 5 });
        expect(rankService.getSingleValue(rank)).toBe(5);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', rank: 7 });
        expect(rankService.getSingleValue(rank)).toBe(7);
    });
});

describe('a computed under the policy that keeps a filled slot', () => {
    it('outlives its last unhold, the flush after a getter read and a detached effect, and keeps its source', () => {
        const { db,effectService, card, rankService, rank, derives } = createFixture(() => new OIMSlotAtEmptyReleasePolicy());
        const read = rankService.getSingleSlot(rank);
        expect(rankService.getSingleValue(rank)).toBe(1);
        db.flush();
        const rankSlot = rankService.holdSingleSlot(rank);
        rankSlot.owner.unholdSlot(rankSlot);
        const effect = effectService.createEffect(db, [], [rankService.getSingleSlot(rank)], () => undefined);
        db.flush();
        effectService.disposeEffect(effect);
        db.flush();

        expect(oimIsSlotReleased(read)).toBe(false);
        expect(rankService.getSingleSlot(rank)).toBe(read);
        expect(card.holdCount).toBe(1);
        expect(derives()).toBe(1);
    });
});

describe('a computed under the policy that releases nothing', () => {
    it('outlives its last unhold and a detached effect, and keeps its source', () => {
        const { db,effectService, card, rankService, rank } = createFixture(() => new OIMSlotNeverReleasePolicy());
        const first = rankService.holdSingleSlot(rank);
        first.owner.unholdSlot(first);
        effectService.disposeEffect(effectService.createEffect(db, [], [rankService.getSingleSlot(rank)], () => undefined));
        db.flush();

        expect(oimIsSlotReleased(first)).toBe(false);
        expect(rankService.getSingleSlot(rank)).toBe(first);
        expect(card.holdCount).toBe(1);
    });
});

describe('a computed under a deadline counted from its mint', () => {
    it('is not released before the deadline, and is within a slice after it, however often it was derived', () => {
        const due = afterWrite(SHORT);
        const { db, cardsService, cards, rankService, rank, clock } = createFixture(due.policyFor);
        const first = rankService.holdSingleSlot(rank);
        first.owner.unholdSlot(first);
        expect(oimIsSlotReleased(first)).toBe(false);

        clock.at(START + SHORT - 1);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', rank: 3 });
        expect(rankService.getSingleValue(rank)).toBe(3);
        due.flush(db);
        expect(oimIsSlotReleased(first)).toBe(false);

        clock.at(START + SHORT + OIM_SLICE_LENGTH_MS);
        due.flush(db);
        expect(oimIsSlotReleased(first)).toBe(true);
    });
});

describe('a computed under the earliest of two policies', () => {
    it('goes at the shorter of the two deadlines', () => {
        const keep = afterUnhold(LONG);
        const due = afterWrite(SHORT);
        const { db, rankService, rank, clock } = createFixture(clock => new OIMSlotEarliestReleasePolicy([
            keep.policyFor(clock), due.policyFor(clock),
        ]));
        const first = rankService.holdSingleSlot(rank);
        first.owner.unholdSlot(first);

        clock.at(START + SHORT + 1);
        due.flush(db);
        keep.flush(db);

        expect(oimIsSlotReleased(first)).toBe(true);
    });
});
