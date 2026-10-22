import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../OIMChannelService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMChannelSlot } from '../utils/createOIMChannelSlot';
import { createOIMCollectorSlot } from '../../collector/utils/createOIMCollectorSlot';
import { OIMErrorPolicyLogAndContinue } from '../../error/OIMErrorPolicyLogAndContinue';
import { OIM_TIMER_ON_TIMEOUT } from '../../schedule/constants/OIM_TIMER_ON_TIMEOUT';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TCard = { id: string; title: string };

const channelService = OIMChannelService.INSTANCE;

describe('what a drop hands back of the frame it will never run', () => {
    it('gives back the hold a getter took, so the identity is reclaimed', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const slot = cardsService.getSlotByKey(cards, 'c1');
        expect(slot.holdCount).toBe(1);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        channelService.dropChannelSlot(db.defaultChannelSlot);

        expect(slot.holdCount).toBe(0);
        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('gives back the holds on a collector handed in from outside, which outlives the channel', () => {
        const db = new OIMDB();
        const channelSlot = createOIMChannelSlot({
            clock: { revision: 0, epoch: 0 },
            collectorSlot: createOIMCollectorSlot({
                getNowMs: Date.now, releaseTimer: OIM_TIMER_ON_TIMEOUT, errorPolicy: OIMErrorPolicyLogAndContinue.INSTANCE,
            }),
            errorPolicy: OIMErrorPolicyLogAndContinue.INSTANCE,
        });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot({ defaultChannelSlot: channelSlot });
        cardsService.getSlotByKey(cards, 'c1');
        expect(cardsService.getSlotCount(cards)).toBe(1);

        channelService.dropChannelSlot(channelSlot);

        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('leaves the flush already under way to be the one that hands it back', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const trigger = cardsService.holdSlotByKey(cards, 'trigger');
        effectService.createEffect(db, [trigger], [], () => { channelService.dropChannelSlot(db.defaultChannelSlot); });
        cardsService.getSlotByKey(cards, 'c1');
        channelService.write(db.defaultChannelSlot, trigger);
        expect(cardsService.getSlotCount(cards)).toBe(2);

        db.flush();

        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    it('hands back each hold once, so a second drop gives nothing back twice', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const slot = cardsService.getSlotByKey(cards, 'c1');

        channelService.dropChannelSlot(db.defaultChannelSlot);
        expect(() => { channelService.dropChannelSlot(db.defaultChannelSlot); }).not.toThrow();

        expect(slot.holdCount).toBe(0);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });
});
