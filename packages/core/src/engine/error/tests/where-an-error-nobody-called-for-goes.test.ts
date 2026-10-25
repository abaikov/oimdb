import { OIMDB, OIMChannelService, OIMSlotAfterWriteReleasePolicy, OIMSlotAtEmptyReleasePolicy, OIMUnusedSlotCollectorService, createOIMEntityWriterInPlace } from '../../../index';
import type { IOIMEntityWriter, IOIMErrorPolicy } from '../../../index';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string };

const collectingErrorPolicy = () => {
    const caught: unknown[] = [];
    const errorPolicy: IOIMErrorPolicy = { onErrorCaught: error => { caught.push(error); } };
    return { caught, errorPolicy };
};

describe('an error with no caller to throw to', () => {
    it('a release-clock tick that throws hands the error to the error policy instead of the timer', () => {
        const { caught, errorPolicy } = collectingErrorPolicy();
        let nowMs = 0;
        let tick: (() => void) | undefined;
        const inPlace = createOIMEntityWriterInPlace();
        const entityWriter: IOIMEntityWriter = {
            ...inPlace,
            clearEntity: () => { throw new Error('the clear threw'); },
        };
        const db = new OIMDB({
            entityWriter,
            errorPolicy,
            getNowMs: () => nowMs,
            releaseTimer: run => { tick = run; return () => { tick = undefined; }; },
            slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 100 }),
        });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a' });
        db.flush();
        nowMs = 5_000;

        expect(tick).toBeDefined();
        expect(() => { tick?.(); }).not.toThrow();
        expect(caught).toEqual([new Error('the clear threw')]);
    });

    it('a throw in the unused-slot sweep at the end of a flush goes to the policy, and after-each-flush still runs', () => {
        const { caught, errorPolicy } = collectingErrorPolicy();
        let refuse = false;
        const slotReleasePolicy = new OIMSlotAtEmptyReleasePolicy();
        jest.spyOn(slotReleasePolicy, 'onSlotUnheld').mockImplementation(() => {
            if (refuse) throw new Error('the unhold threw');
        });
        const db = new OIMDB({ errorPolicy, slotReleasePolicy });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a' });
        db.flush();
        let afterEachFlushRuns = 0;
        OIMChannelService.INSTANCE.subscribeAfterEachFlush(db.defaultChannelSlot, () => { afterEachFlushRuns++; });
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(db.collectorSlot.unusedSlotCollectorSlot, card);
        refuse = true;

        expect(() => { db.flush(); }).not.toThrow();
        expect(caught).toEqual([new Error('the unhold threw')]);
        expect(afterEachFlushRuns).toBe(1);
    });

    it('the database holds one error policy and its channel reports through it', () => {
        const { caught, errorPolicy } = collectingErrorPolicy();
        const db = new OIMDB({ errorPolicy });
        OIMChannelService.INSTANCE.subscribeAfterEachFlush(db.defaultChannelSlot, () => { throw new Error('the handler threw'); });

        db.flush();

        expect(db.defaultChannelSlot.errorPolicy).toBe(errorPolicy);
        expect(caught).toEqual([new Error('the handler threw')]);
    });
});
