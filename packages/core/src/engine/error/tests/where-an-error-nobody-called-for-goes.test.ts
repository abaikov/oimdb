import {
    OIMDB, OIMChannelService, OIMSlotReleasePolicyAfterWrite, OIMSlotReleasePolicyAtEmpty,
    OIMUnusedSlotCollectorService, createOIMEntityService, createOIMEntityWriterInPlace,
} from '../../../index';
import type { IOIMEntityWriter, IOIMErrorPolicy } from '../../../index';

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
            slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 100 }),
        });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a' });
        db.flush();
        nowMs = 5_000;

        expect(tick).toBeDefined();
        expect(() => { tick?.(); }).not.toThrow();
        expect(caught).toEqual([new Error('the clear threw')]);
    });

    it('a throw in the unused-slot sweep at the end of a flush goes to the policy, and after-each-flush still runs', () => {
        const { caught, errorPolicy } = collectingErrorPolicy();
        let refuse = false;
        const slotReleasePolicy = new OIMSlotReleasePolicyAtEmpty();
        jest.spyOn(slotReleasePolicy, 'onSlotUnheld').mockImplementation(() => {
            if (refuse) throw new Error('the unhold threw');
        });
        const db = new OIMDB({ errorPolicy, slotReleasePolicy });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards,{ id: 'a' });
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
