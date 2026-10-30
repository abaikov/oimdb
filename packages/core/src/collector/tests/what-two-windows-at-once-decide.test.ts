import { OIMSlotAfterIdleReleasePolicy } from '../OIMSlotAfterIdleReleasePolicy';
import { oimMintAfterIdleSlotReleaseWheel } from '../utils/oimMintAfterIdleSlotReleaseWheel';
import { oimMintAfterWriteSlotReleaseWheel } from '../utils/oimMintAfterWriteSlotReleaseWheel';
import { OIMSlotAfterWriteReleasePolicy } from '../OIMSlotAfterWriteReleasePolicy';
import { OIMSlotEarliestReleasePolicy } from '../OIMSlotEarliestReleasePolicy';
import { OIMDB, OIMEffectService, oimIsSlotReleased } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const START = 1_000_000;

const createFixtureWith = (idleMs: number, afterWriteMs: number) => {
    let ms = START;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: () => () => undefined });
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db), slotReleasePolicy: new OIMSlotEarliestReleasePolicy([
            new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: afterWriteMs }),
            new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: idleMs }),
        ]) });
    const cards = cardsService.createStoreSlot(db);
    return {
        db,
        cardsService,
        cards,
        at: (value: number): void => { ms = value; },
        collect: (): void => {
            oimMintAfterIdleSlotReleaseWheel(db.collectorSlot).flush();
            oimMintAfterWriteSlotReleaseWheel(db.collectorSlot).flush();
        },
    };
};

describe('a row under both windows at once', () => {
    it('goes on the SHORTER of the two, when the write window is the shorter', () => {
        const fixture =createFixtureWith(60_000, 20_000);
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();

        fixture.at(START + 21_000);
        fixture.collect();

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });

    it('goes on the SHORTER of the two, when the idle window is the shorter', () => {
        const fixture =createFixtureWith(20_000, 60_000);
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();

        fixture.at(START + 21_000);
        fixture.collect();

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });

    it('is kept while the shorter of the two has not run out', () => {
        const fixture =createFixtureWith(60_000, 20_000);
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();

        fixture.at(START + 19_000);
        fixture.collect();

        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
    });

    it('outranks both windows with a watcher, and goes the moment that watcher leaves', () => {
        const fixture =createFixtureWith(60_000, 20_000);
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();
        const effect = OIMEffectService.INSTANCE.createEffect(fixture.db, () => undefined, [slot]);

        fixture.at(START + 21_000);
        fixture.collect();
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });

        OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });
});
