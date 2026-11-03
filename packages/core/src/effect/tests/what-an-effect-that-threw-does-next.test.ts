import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import { OIMLogAndContinueErrorPolicy } from '../../error/OIMLogAndContinueErrorPolicy';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../computed/createOIMSingleComputedService';

type TCard = { id: string; n: number };

const createFixture = () => {
    const db = new OIMDB({ errorPolicy: new OIMLogAndContinueErrorPolicy({ onError: () => undefined }) });
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const failing = cardsService.writeSlotContentByKey(cards, 'failing', { id: 'failing', n: 0 });
    const other = cardsService.writeSlotContentByKey(cards, 'other', { id: 'other', n: 0 });
    const constantOfOtherComputedService = createOIMSingleComputedService<number>();
    const constantOfOther = constantOfOtherComputedService.createStoreSlot(
        db,
        () => 0,
        () => ({ sourceSlots: [other] }),
    );
    db.flush();
    const updateCard = (id: string, patch: Partial<TCard>): void => {
        const cardSlot = cardsService.peekSlotByKey(cards, id);
        if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, patch);
    };
    return {
        db, effectService, updateCard, failing, constantOfOther,
        constantOfOtherService: constantOfOtherComputedService,
    };
};

describe('what an effect that threw does next', () => {
    let consoleError: jest.SpyInstance;
    beforeEach(() => { consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => { consoleError.mockRestore(); });

    it('takes the change it failed on again at its next wake, even a wake from an unchanged computed', () => {
        const { db, effectService, updateCard, failing, constantOfOther, constantOfOtherService } = createFixture();
        let throwNext = false;
        const seen: number[] = [];
        effectService.createEffect(db, () => {
            if (throwNext) { throwNext = false; throw new Error('the body failed'); }
            seen.push(failing.entity?.n ?? -1);
        }, [failing], [constantOfOtherService.holdSingleSlot(constantOfOther)]);
        seen.length = 0;

        throwNext = true;
        updateCard('failing', { n: 1 });
        db.flush();
        updateCard('other', { n: 1 });
        db.flush();

        expect(seen).toEqual([1]);
    });

    it('is not run again inside the frame it threw in', () => {
        const { db, effectService, updateCard, failing } = createFixture();
        let runs = 0;
        effectService.createEffect(db, () => { runs++; throw new Error('always'); }, [failing]);
        runs = 0;

        updateCard('failing', { n: 1 });
        db.flush();

        expect(runs).toBe(1);
        expect(consoleError).toHaveBeenCalledTimes(1);
    });

    it('a body that succeeds after a wake from an unchanged computed is not run for it', () => {
        const { db, effectService, updateCard, failing, constantOfOther, constantOfOtherService } = createFixture();
        let runs = 0;
        effectService.createEffect(db, () => { runs++; }, [failing], [constantOfOtherService.holdSingleSlot(constantOfOther)]);
        updateCard('failing', { n: 1 });
        db.flush();
        runs = 0;

        updateCard('other', { n: 1 });
        db.flush();

        expect(runs).toBe(0);
    });
});
