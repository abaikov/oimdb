import { OIMDB } from '../../db/OIMDB';
import { OIMChannelService } from '../OIMChannelService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIM_REVISIONS_PER_EPOCH } from '../constants/OIM_REVISIONS_PER_EPOCH';
import { isOIMRevisionAfter } from '../utils/isOIMRevisionAfter';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import type { OIMEntityContentService } from '../../entity/OIMEntityContentService';

type TCard = { id: string; n: number };

const LARGEST_SMALL_INTEGER_UNDER_POINTER_COMPRESSION = 2 ** 30 - 1;

const channelService = OIMChannelService.INSTANCE;

const updateEntityByKey = (
    cardsService: ReturnType<typeof createOIMSlotCollectionService<OIMEntityContentService<TCard>>>,
    cards: ReturnType<ReturnType<typeof createOIMSlotCollectionService<OIMEntityContentService<TCard>>>['createStoreSlot']>,
    key: string, patch: Partial<TCard>,
): void => {
    const slot = cardsService.peekSlotByKey(cards, key);
    if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
};

const openCards = () => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', n: 0 });
    const held = cardsService.holdSlotByKey(cards, 'c1');
    db.flush();
    return { db, effectService, cardsService, cards, card, held };
};

describe('what a revision reads at the end of an epoch', () => {
    it('never reaches 2^30, and starts the next epoch at zero', () => {
        const { db, card } = openCards();
        const clock = db.defaultChannelSlot.clock;
        clock.revision = OIM_REVISIONS_PER_EPOCH - 2;
        const startEpoch = clock.epoch;
        const seen: [number, number][] = [];

        for (let i = 0; i < 4; i++) {
            channelService.write(db.defaultChannelSlot, card);
            seen.push([clock.revision, clock.epoch]);
        }

        expect(seen).toEqual([
            [OIM_REVISIONS_PER_EPOCH - 1, startEpoch],
            [0, startEpoch + 1],
            [1, startEpoch + 1],
            [2, startEpoch + 1],
        ]);
        expect(Math.max(...seen.map(([revision]) => revision)))
            .toBeLessThanOrEqual(LARGEST_SMALL_INTEGER_UNDER_POINTER_COMPRESSION);
    });

    it('gives an epoch exactly OIM_REVISIONS_PER_EPOCH revisions, 0 through one less', () => {
        const { db, card } = openCards();
        const clock = db.defaultChannelSlot.clock;
        clock.revision = OIM_REVISIONS_PER_EPOCH - 5;
        const startEpoch = clock.epoch;
        let largestInTheEpoch = clock.revision;

        while (clock.epoch === startEpoch) {
            largestInTheEpoch = clock.revision;
            channelService.write(db.defaultChannelSlot, card);
        }

        expect(largestInTheEpoch + 1).toBe(OIM_REVISIONS_PER_EPOCH);
        expect(clock.revision).toBe(0);
    });

    it('stamps the slot with the stamp it was written at, on both sides of the turn', () => {
        const { db, card } = openCards();
        db.defaultChannelSlot.clock.revision = OIM_REVISIONS_PER_EPOCH - 2;

        channelService.write(db.defaultChannelSlot, card);
        const before = [card.changedAtRevision, card.changedAtEpoch] as const;
        channelService.write(db.defaultChannelSlot, card);
        const after = [card.changedAtRevision, card.changedAtEpoch] as const;

        expect(before[0]).toBe(OIM_REVISIONS_PER_EPOCH - 1);
        expect(after[0]).toBe(0);
        expect(isOIMRevisionAfter(after[0], after[1], before[0], before[1])).toBe(true);
        expect(isOIMRevisionAfter(before[0], before[1], after[0], after[1])).toBe(false);
    });

    it('wakes an effect for a write that lands after the turn on a frame that opened before it', () => {
        const { db, effectService, cardsService, cards, card, held } = openCards();
        db.defaultChannelSlot.clock.revision = OIM_REVISIONS_PER_EPOCH - 2;
        updateEntityByKey(cardsService, cards, 'c1', { n: 1 });
        db.flush();
        let runs = 0;
        effectService.createEffect(db, () => { runs++; }, [card]);

        updateEntityByKey(cardsService, cards, 'c1', { n: 2 });
        updateEntityByKey(cardsService, cards, 'c1', { n: 3 });
        db.flush();

        expect(db.defaultChannelSlot.clock.revision).toBeLessThan(OIM_REVISIONS_PER_EPOCH);
        expect(runs).toBe(1);
        held.owner.unholdSlot(held);
    });

    it('wraps the epoch past the largest int32 and still orders a write after the one before it', () => {
        const { db, card } = openCards();
        const clock = db.defaultChannelSlot.clock;
        clock.epoch = 2 ** 31 - 1;
        clock.revision = OIM_REVISIONS_PER_EPOCH - 1;
        const before = { revision: clock.revision, epoch: clock.epoch };

        channelService.write(db.defaultChannelSlot, card);

        expect([clock.revision, clock.epoch]).toEqual([0, -(2 ** 31)]);
        expect(isOIMRevisionAfter(clock.revision, clock.epoch, before.revision, before.epoch)).toBe(true);
        expect(isOIMRevisionAfter(before.revision, before.epoch, clock.revision, clock.epoch)).toBe(false);
    });
});
