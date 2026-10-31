import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../computed/createOIMSingleComputedService';

type Card = { id: string; title: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<Card, string>() });
    const cards = cardsService.createStoreSlot(db);
    cardsService.holdSlotByKey(cards, 'a');
    const rowSlot = cardsService.getSlotByKey(cards, 'a');
    const rankService = createOIMSingleComputedService<number>({ sameValueGuard: oimSameValueZeroGuard });
    const rankComputed = rankService.createComputedStoreSlot(
        db,
        () => rowSlot.entity?.rank ?? -1,
        () => ({ sourceSlots: [rowSlot] }),
    );
    const rank = rankService.computedSingleSlotService.holdSingleSlot(rankComputed);
    return { db, effectService, cards, cardsService, row: rowSlot, rank };
};

describe('what an effect that names one derivation twice leaves behind', () => {
    it('leaves every other subscriber in the derivation\'s list', () => {
        const { db, effectService, rank } = createFixture();
        // AHEAD OF IT, so that its departure carries the doubled effect to a new
        // position and the repair has an edge to land on.
        const ahead = effectService.createEffect(db, () => undefined, [], [rank]);
        const doubled = effectService.createEffect(db, () => undefined, [], [rank, rank]);
        effectService.disposeEffect(ahead);
        // AND TWO BEHIND IT, so that the position the repair did not reach is
        // occupied by a live subscriber rather than past the end of the list.
        const first = effectService.createEffect(db, () => undefined, [], [rank]);
        const second = effectService.createEffect(db, () => undefined, [], [rank]);

        effectService.disposeEffect(doubled);

        expect(rank.effects?.includes(first)).toBe(true);
        expect(rank.effects?.includes(second)).toBe(true);
        expect(rank.effects?.includes(doubled)).toBe(false);
        expect(rank.effects?.length).toBe(2);
    });

    it('takes one place in the list and gives one back', () => {
        const { db, effectService, rank } = createFixture();
        const doubled = effectService.createEffect(db, () => undefined, [], [rank, rank]);

        // ONE ENTRY, because one effect reading one derivation is one dependent
        // however many times the caller named it.
        expect(rank.effects?.length).toBe(1);

        effectService.disposeEffect(doubled);

        // And it empties, which is what tells a filed derivation that nothing
        // reads it any more.
        expect(rank.effects?.length).toBe(0);
    });

    it('still runs the body once for a write the derivation passes on', () => {
        const { db, effectService, cards, cardsService, rank } = createFixture();
        let runs = 0;
        let seen = -1;
        effectService.createEffect(db, () => { runs++; seen = rank.computedValueService.getValueForSlot(rank); }, [], [rank, rank]);

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 7 });
        db.flush();

        expect({ runs, seen }).toEqual({ runs: 1, seen: 7 });
    });
});
