import { OIMDB } from '../OIMDB';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMComputedService } from '../../computed/createOIMComputedService';

type TCard = { id: string; rank: number };

function setUp() {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', rank: 1 });
    const doubledService = createOIMComputedService<string, number>({});
    const doubled = doubledService.createStoreSlot(
        db,
        computedSlot => (cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? 0) * 2,
        ({ key }) => ({ sourceSlots: [cardsService.getSlotByKey(cards, key)] }),
    );
    db.flush();
    const doubledAce = doubledService.holdSlotByKey(doubled, 'ace');
    return { db, cardsService, ace, doubledService, doubledAce };
}

describe('the sources db.createEffect accepts', () => {
    it('takes an entity slot and an entity column slot as root sources', () => {
        const { db, cardsService, ace } = setUp();
        const rankColumn = cardsService.columnSlotService.holdColumnSlot(ace, 'rank');
        let runs = 0;
        const dispose = db.createEffect(() => { runs++; }, [ace, rankColumn]);

        cardsService.slotContentService.updateEntity(ace, { rank: 2 });
        db.flush();
        dispose();

        expect(runs).toBe(2);
    });

    it('refuses a computed slot and a computed column slot at the type level', () => {
        const { db, doubledService, doubledAce } = setUp();
        const anyDoubledColumn = doubledService.columnSlotService.holdAnyColumnSlot(doubledAce);

        // @ts-expect-error a computed slot is a computed source, not a root source
        const disposeComputed = db.createEffect(() => undefined, [doubledAce]);
        // @ts-expect-error a computed column slot is a computed source, not a root source
        const disposeComputedColumn = db.createEffect(() => undefined, [anyDoubledColumn]);
        disposeComputed();
        disposeComputedColumn();

        expect(typeof disposeComputed).toBe('function');
    });
});
