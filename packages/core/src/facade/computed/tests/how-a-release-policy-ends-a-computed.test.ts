import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../../engine/store/OIMSlotStoreServiceSingleSlotDriven';
import { OIMReleaseSlotCollectorServiceAfterUnhold } from '../../../engine/collector/OIMReleaseSlotCollectorServiceAfterUnhold';
import { OIMReleaseSlotCollectorServiceAfterWrite } from '../../../engine/collector/OIMReleaseSlotCollectorServiceAfterWrite';
import { OIMSlotReleasePolicyAfterUnhold } from '../../../engine/collector/OIMSlotReleasePolicyAfterUnhold';
import { OIMSlotReleasePolicyAfterWrite } from '../../../engine/collector/OIMSlotReleasePolicyAfterWrite';
import { OIMSlotReleasePolicyEarliest } from '../../../engine/collector/OIMSlotReleasePolicyEarliest';
import { OIMSlotReleasePolicyAtEmpty } from '../../../engine/collector/OIMSlotReleasePolicyAtEmpty';
import { OIMSlotReleasePolicyNever } from '../../../engine/collector/OIMSlotReleasePolicyNever';
import { OIM_SLICE_LENGTH_MS } from '../../../engine/collector/constants/OIM_SLICE_LENGTH_MS';
import type { IOIMSlotReleasePolicy } from '../../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';

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
    const cardsService = createOIMEntityService<Card>(db, { keyOf: (card: Card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntity(cards, { id: 'a', rank: 1 });
    db.flush();
    const card = cardsService.getSlotByKey(cards, 'a');
    let builds = 0;
    let derives = 0;
    const rankComputedService = createOIMComputedService<void, number>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        slotReleasePolicy: slotReleasePolicyFor?.(clock),
    });
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
    const rankCollectionService = rankComputedService.computedCollectionService;
    const rankService = {
        holdSlotByKey: (storeSlot: typeof rank, key: undefined) => rankCollectionService.holdSlotByKey(storeSlot, key),
        getSlotByKey: (storeSlot: typeof rank, key: undefined) => rankCollectionService.getSlotByKey(storeSlot, key),
        getValueByKey: (storeSlot: typeof rank, key: undefined) => {
            const computedSlot = rankCollectionService.getSlotByKey(storeSlot, key);
            return computedSlot.computedValueService.getValueForSlot(computedSlot);
        },
    };
    return { db, effectService, cardsService, cards, card, rankService, rank, clock, builds: () => builds, derives: () => derives };
};

const afterUnhold = (keepAfterUnholdMs: number) => ({
    policyFor: (_clock: TClock): IOIMSlotReleasePolicy => new OIMSlotReleasePolicyAfterUnhold({ keepAfterUnholdMs }),
    flush: (db: OIMDB): void => {
        OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE.flush(db.collectorSlot.afterUnholdReleaseSlotCollectorSlot);
    },
});

const afterWrite = (keepAfterWriteMs: number) => ({
    policyFor: (_clock: TClock): IOIMSlotReleasePolicy => new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs }),
    flush: (db: OIMDB): void => {
        OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.flush(db.collectorSlot.afterWriteReleaseSlotCollectorSlot);
    },
});

describe('a computed under the default policy', () => {
    it('goes at the last unhold, gives back its source, and the next read builds a new one', () => {
        const { cardsService, cards, card, rankService, rank, builds } = createFixture();
        const first = rankService.holdSlotByKey(rank, undefined);
        expect(card.holdCount).toBe(1);

        first.owner.unholdSlot(first);

        expect(oimIsSlotReleased(first)).toBe(true);
        expect(card.holdCount).toBe(0);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', rank: 4 });
        expect(rankService.getValueByKey(rank, undefined)).toBe(4);
        expect(builds()).toBe(2);
    });

    it('lives under an effect whatever the holds, and goes when the effect detaches', () => {
        const { db,effectService, card, rankService, rank } = createFixture();
        const effect = effectService.createEffect(db, [], [rankService.getSlotByKey(rank, undefined)], () => undefined);
        const subscribed = rankService.getSlotByKey(rank, undefined);
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
        const first = rankService.holdSlotByKey(rank, undefined);
        first.owner.unholdSlot(first);

        expect(oimIsSlotReleased(first)).toBe(false);
        expect(card.holdCount).toBe(1);
        expect(rankService.holdSlotByKey(rank, undefined)).toBe(first);
    });

    it('survives the flush that gives back a getter read, without deriving again', () => {
        const keep = afterUnhold(LONG);
        const { db,rankService, rank, derives } = createFixture(keep.policyFor);
        const first = rankService.getSlotByKey(rank, undefined);
        expect(rankService.getValueByKey(rank, undefined)).toBe(1);

        db.flush();

        expect(oimIsSlotReleased(first)).toBe(false);
        expect(rankService.getSlotByKey(rank, undefined)).toBe(first);
        expect(rankService.getValueByKey(rank, undefined)).toBe(1);
        expect(derives()).toBe(1);
    });

    it('goes once the window has run out, and gives its source back', () => {
        const keep = afterUnhold(LONG);
        const { db, card, rankService, rank, clock } = createFixture(keep.policyFor);
        const first = rankService.holdSlotByKey(rank, undefined);
        first.owner.unholdSlot(first);

        clock.at(START + LONG + 1);
        keep.flush(db);

        expect(oimIsSlotReleased(first)).toBe(true);
        expect(card.holdCount).toBe(0);
    });

    it('reads a root deleted and written again inside the window', () => {
        const keep = afterUnhold(LONG);
        const { cardsService, cards, rankService, rank } = createFixture(keep.policyFor);
        expect(rankService.getValueByKey(rank, undefined)).toBe(1);

        const cardSlot = cardsService.findSlotByKey(cards, 'a');
        if (cardSlot !== undefined) cardsService.slotContentService.deleteEntity(cardSlot);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', rank: 5 });
        expect(rankService.getValueByKey(rank, undefined)).toBe(5);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', rank: 7 });
        expect(rankService.getValueByKey(rank, undefined)).toBe(7);
    });
});

describe('a computed under the policy that keeps a filled slot', () => {
    it('outlives its last unhold, the flush after a getter read and a detached effect, and keeps its source', () => {
        const { db,effectService, card, rankService, rank, derives } = createFixture(() => new OIMSlotReleasePolicyAtEmpty());
        const read = rankService.getSlotByKey(rank, undefined);
        expect(rankService.getValueByKey(rank, undefined)).toBe(1);
        db.flush();
        const rankSlot = rankService.holdSlotByKey(rank, undefined);
        rankSlot.owner.unholdSlot(rankSlot);
        const effect = effectService.createEffect(db, [], [rankService.getSlotByKey(rank, undefined)], () => undefined);
        db.flush();
        effectService.disposeEffect(effect);
        db.flush();

        expect(oimIsSlotReleased(read)).toBe(false);
        expect(rankService.getSlotByKey(rank, undefined)).toBe(read);
        expect(card.holdCount).toBe(1);
        expect(derives()).toBe(1);
    });
});

describe('a computed under the policy that releases nothing', () => {
    it('outlives its last unhold and a detached effect, and keeps its source', () => {
        const { db,effectService, card, rankService, rank } = createFixture(() => new OIMSlotReleasePolicyNever());
        const first = rankService.holdSlotByKey(rank, undefined);
        first.owner.unholdSlot(first);
        effectService.disposeEffect(effectService.createEffect(db, [], [rankService.getSlotByKey(rank, undefined)], () => undefined));
        db.flush();

        expect(oimIsSlotReleased(first)).toBe(false);
        expect(rankService.getSlotByKey(rank, undefined)).toBe(first);
        expect(card.holdCount).toBe(1);
    });
});

describe('a computed under a deadline counted from its mint', () => {
    it('is not released before the deadline, and is within a slice after it, however often it was derived', () => {
        const due = afterWrite(SHORT);
        const { db, cardsService, cards, rankService, rank, clock } = createFixture(due.policyFor);
        const first = rankService.holdSlotByKey(rank, undefined);
        first.owner.unholdSlot(first);
        expect(oimIsSlotReleased(first)).toBe(false);

        clock.at(START + SHORT - 1);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', rank: 3 });
        expect(rankService.getValueByKey(rank, undefined)).toBe(3);
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
        const { db, rankService, rank, clock } = createFixture(clock => new OIMSlotReleasePolicyEarliest([
            keep.policyFor(clock), due.policyFor(clock),
        ]));
        const first = rankService.holdSlotByKey(rank, undefined);
        first.owner.unholdSlot(first);

        clock.at(START + SHORT + 1);
        due.flush(db);
        keep.flush(db);

        expect(oimIsSlotReleased(first)).toBe(true);
    });
});
