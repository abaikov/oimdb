import { OIMDB } from '../OIMDB';
import { OIMEffectService } from '../../engine/computed/OIMEffectService';
import { OIMChannelService } from '../../engine/channel/OIMChannelService';
import { OIMSlotContentBucketServiceSetDriven } from '../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { createOIMBucketService } from '../createOIMBucketService';
import { createOIMEntityService } from '../createOIMEntityService';
import type { TOIMBucketSlotsSetStore } from '../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../engine/store/types/TOIMStoreKey';
import { oimIsSlotReleased } from '../../engine/slot/utils/oimIsSlotReleased';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const decksOn = (db: OIMDB) => createOIMBucketService<
    TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });

describe('the root a caller gets with no wiring of their own', () => {
    it('hands every collection it mints the same channel and the same collector', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const decksService = decksOn(db);
        const cards = cardsService.createStoreSlot(db);
        const decks = decksService.createStoreSlot(db);

        expect(cards.channelSlot.collectorSlot).toBe(db.collectorSlot);
        expect(decks.channelSlot.collectorSlot).toBe(db.collectorSlot);
        expect(decks.channelSlot).toBe(db.defaultChannelSlot);
        expect(db.defaultChannelSlot.collectorSlot).toBe(db.collectorSlot);
    });

    it('wakes an effect on a collection it minted, with nothing else wired', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.holdSlotByKey(cards, 'c1');

        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, [card], [], () => { runs++; });
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();

        expect(runs).toBe(1);
        expect(cardsService.slotContentService.findEntityByKey(cards, 'c1')).toEqual({ id: 'c1', title: 'one' });
        card.owner.unholdSlot(card);
    });

    it('settles the frame and sweeps what nobody took, in one call', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const decksService = decksOn(db);
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.getSlotByKey(decks, 'spades');
        const card = cardsService.getSlotByKey(cards, 'c1');

        db.flush();

        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(oimIsSlotReleased(card)).toBe(true);
        expect(oimIsSlotReleased(deck)).toBe(true);
    });

    it('sweeps what a body read while the frame was running', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const held = cardsService.holdSlotByKey(cards, 'c1');

        let read: string | undefined;
        OIMEffectService.INSTANCE.createEffect(db, [held], [], () => { read = cardsService.getSlotByKey(cards, 'read-inside').key as string; });
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();

        expect(read).toBe('read-inside');
        expect(Array.from(cardsService.getSlots(cards)).map(slot => slot.key)).toEqual(['c1']);
        held.owner.unholdSlot(held);
    });

    it('runs one frame and no more, because nothing may write another one into being', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.holdSlotByKey(cards, 'c1');

        let frames = 0;
        let refused: unknown;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => {
            frames++;
            try {
                cardsService.slotContentService.updateEntity(card, { title: 'from a handler' });
            } catch (failure) {
                refused = failure;
            }
        });
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });

        db.flush();

        expect(frames).toBe(1);
        expect((refused as Error).message).toMatch(/writes are refused/);
        card.owner.unholdSlot(card);
    });
});
