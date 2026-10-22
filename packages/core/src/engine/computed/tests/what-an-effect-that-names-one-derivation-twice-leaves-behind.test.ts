import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../OIMEffectService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';

type Card = { id: string; title: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.holdSlotByKey(cards, 'a');
    const rowSlot = cardsService.getSlotByKey(cards, 'a');
    const rankService = createOIMComputedService<void, number>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        sameValueGuard: oimSameValueZeroGuard,
    });
    const rankComputed = rankService.createComputedStoreSlot(
        db,
        () => rowSlot.entity?.rank ?? -1,
        () => ({ sourceSlots: [rowSlot] }),
    );
    const rank = rankService.computedCollectionService.holdSlotByKey(rankComputed, undefined);
    return { db, effectService, cards, cardsService, row: rowSlot, rank };
};

describe('what an effect that names one derivation twice leaves behind', () => {
    it('leaves every other subscriber in the derivation\'s list', () => {
        const { db, effectService, rank } = createFixture();
        // AHEAD OF IT, so that its departure carries the doubled effect to a new
        // position and the repair has an edge to land on.
        const ahead = effectService.createEffect(db, [], [rank], () => undefined);
        const doubled = effectService.createEffect(db, [], [rank, rank], () => undefined);
        effectService.disposeEffect(ahead);
        // AND TWO BEHIND IT, so that the position the repair did not reach is
        // occupied by a live subscriber rather than past the end of the list.
        const first = effectService.createEffect(db, [], [rank], () => undefined);
        const second = effectService.createEffect(db, [], [rank], () => undefined);

        effectService.disposeEffect(doubled);

        expect(rank.effects?.includes(first)).toBe(true);
        expect(rank.effects?.includes(second)).toBe(true);
        expect(rank.effects?.includes(doubled)).toBe(false);
        expect(rank.effects?.length).toBe(2);
    });

    it('takes one place in the list and gives one back', () => {
        const { db, effectService, rank } = createFixture();
        const doubled = effectService.createEffect(db, [], [rank, rank], () => undefined);

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
        effectService.createEffect(db, [], [rank, rank], () => { runs++; seen = rank.computedValueService.getValueForSlot(rank); });

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 7 });
        db.flush();

        expect({ runs, seen }).toEqual({ runs: 1, seen: 7 });
    });
});
