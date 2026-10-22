import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEffect } from '../types/TOIMEffect';

type TCard = { id: string; title: string };

describe('an effect that leaves before its body is done', () => {
    it('runs the cleanup its body returned after disposing itself from inside', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        let cleanups = 0;
        const self: { effect?: TOIMEffect } = {};
        self.effect = effectService.createEffect(db, [cardsService.getSlotByKey(cards, 'c1')], [], () => {
            if (self.effect) effectService.disposeEffect(self.effect);
            return () => { cleanups++; };
        });

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();

        expect(cleanups).toBe(1);
    });

    it('gives back what it took when its first run throws, and throws to the caller', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const slot = cardsService.holdSlotByKey(cards, 'c1');

        expect(() => effectService.createEffectImmediate(db, [slot], [], () => { throw new Error('first run threw'); }))
            .toThrow('first run threw');

        expect(slot.effects?.length ?? 0).toBe(0);
        expect(slot.holdCount).toBe(1);
        slot.owner.unholdSlot(slot);
    });
});

describe('one handler subscribed twice', () => {
    it('stays subscribed through the disposer it was not given back', () => {
        const db = new OIMDB();
        let calls = 0;
        const handler = (): void => { calls++; };
        const firstDisposer = OIMChannelService.INSTANCE.subscribeAfterEachFlush(db.defaultChannelSlot, handler);
        const secondDisposer = OIMChannelService.INSTANCE.subscribeAfterEachFlush(db.defaultChannelSlot, handler);

        secondDisposer();
        db.flush();
        expect(calls).toBe(1);

        firstDisposer();
        db.flush();
        expect(calls).toBe(1);
    });

    it('stays subscribed after each frame through the disposer it was not given back', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        let calls = 0;
        const handler = (): void => { calls++; };
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, handler);
        const secondDisposer = OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, handler);

        secondDisposer();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();

        expect(calls).toBe(1);
    });
});
