import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';

type TCard = { id: string; n: number };

const createFixture = () => {
    const hostQueue: (() => void)[] = [];
    const db = new OIMDB({ channelScheduler: run => { hostQueue.push(run); } });
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const card = cardsService.slotContentService.upsertEntity(cards, { id: 'a', n: 0 });
    let runs = 0;
    let seenN = -1;
    OIMEffectService.INSTANCE.createEffect(db, [card], [], () => { runs++; seenN = card.entity?.n ?? -1; });
    while (hostQueue.length > 0) hostQueue.shift()!();
    return { db, card, cardsService, hostQueue, runs: (): number => runs, seenN: (): number => seenN };
};

describe('what a callback the host could not cancel does', () => {
    it('leaves the write after a manual flush to the callback armed for it', () => {
        const { db, card, cardsService, hostQueue, runs } = createFixture();
        const runsBefore = runs();
        cardsService.slotContentService.updateEntity(card, { n: 1 });
        db.flush();
        cardsService.slotContentService.updateEntity(card, { n: 2 });
        const stale = hostQueue.shift()!;

        stale();

        expect(runs()).toBe(runsBefore + 1);
    });

    it('does not let the next write arm a second callback while a live one waits', () => {
        const { db, card, cardsService, hostQueue } = createFixture();
        cardsService.slotContentService.updateEntity(card, { n: 1 });
        db.flush();
        cardsService.slotContentService.updateEntity(card, { n: 2 });
        hostQueue.shift()!();

        cardsService.slotContentService.updateEntity(card, { n: 3 });

        expect(hostQueue).toHaveLength(1);
    });

    it('delivers the last write, in one frame with the one before it', () => {
        const { db, card, cardsService, hostQueue, runs, seenN } = createFixture();
        const runsBefore = runs();
        cardsService.slotContentService.updateEntity(card, { n: 1 });
        db.flush();
        cardsService.slotContentService.updateEntity(card, { n: 2 });
        hostQueue.shift()!();
        cardsService.slotContentService.updateEntity(card, { n: 3 });
        while (hostQueue.length > 0) hostQueue.shift()!();

        expect(seenN()).toBe(3);
        expect(runs()).toBe(runsBefore + 2);
    });
});
