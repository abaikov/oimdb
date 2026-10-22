import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMErrorPolicyLogAndContinue } from '../../error/OIMErrorPolicyLogAndContinue';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMSingleSlotStore } from '../../store/types/TOIMSingleSlotStore';

type TCard = { id: string; n: number };

const createFixture = () => {
    const db = new OIMDB({ errorPolicy: new OIMErrorPolicyLogAndContinue({ onError: () => undefined }) });
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const failing = cardsService.slotContentService.upsertEntity(cards, { id: 'failing', n: 0 });
    const other = cardsService.slotContentService.upsertEntity(cards, { id: 'other', n: 0 });
    const constantOfOtherComputedService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
    });
    const constantOfOther = constantOfOtherComputedService.createComputedStoreSlot(
        db,
        () => 0,
        () => ({ sourceSlots: [other] }),
    );
    db.flush();
    const updateCard = (id: string, patch: Partial<TCard>): void => {
        const cardSlot = cardsService.findSlotByKey(cards, id);
        if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, patch);
    };
    return {
        db, effectService, updateCard, failing, constantOfOther,
        constantOfOtherService: constantOfOtherComputedService.computedCollectionService,
    };
};

describe('what an effect that threw does next', () => {
    it('takes the change it failed on again at its next wake, even a wake from an unchanged computed', () => {
        const { db, effectService, updateCard, failing, constantOfOther, constantOfOtherService } = createFixture();
        let throwNext = false;
        const seen: number[] = [];
        effectService.createEffect(db, [failing], [constantOfOtherService.holdSlotByKey(constantOfOther, undefined)], () => {
            if (throwNext) { throwNext = false; throw new Error('the body failed'); }
            seen.push(failing.entity?.n ?? -1);
        });
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
        effectService.createEffect(db, [failing], [], () => { runs++; throw new Error('always'); });
        runs = 0;

        updateCard('failing', { n: 1 });
        db.flush();

        expect(runs).toBe(1);
    });

    it('a body that succeeds after a wake from an unchanged computed is not run for it', () => {
        const { db, effectService, updateCard, failing, constantOfOther, constantOfOtherService } = createFixture();
        let runs = 0;
        effectService.createEffect(db, [failing], [constantOfOtherService.holdSlotByKey(constantOfOther, undefined)], () => { runs++; });
        updateCard('failing', { n: 1 });
        db.flush();
        runs = 0;

        updateCard('other', { n: 1 });
        db.flush();

        expect(runs).toBe(0);
    });
});
