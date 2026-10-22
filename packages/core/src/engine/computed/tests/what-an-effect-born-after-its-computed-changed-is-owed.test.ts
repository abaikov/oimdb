import { OIMDB, OIMEffectService, OIMSlotStoreServiceSingleSlotDriven, createOIMComputedService, createOIMEntityService } from '../../../index';
import type { TOIMComputedSlot, TOIMSingleSlotStore } from '../../../index';

type TCard = { id: string; n: number };

const runsOfAnEffectBornAfterTheChange = (writeSomethingElseFirst: boolean): number => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const source = cardsService.slotContentService.upsertEntity(cards, { id: 's', n: 0 });
    cardsService.slotContentService.upsertEntity(cards, { id: 'o', n: 0 });
    const valueOfSourceService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
    });
    const valueOfSource = valueOfSourceService.createComputedStoreSlot(
        db, () => source.entity?.n ?? -1, () => ({ sourceSlots: [source] }),
    );
    const computedSlot = valueOfSourceService.computedCollectionService.holdSlotByKey(valueOfSource, undefined);
    computedSlot.computedValueService.getValueForSlot(computedSlot);
    db.flush();
    cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 's')!, { n: 1 });
    let runs = 0;
    effectService.createEffect(db, [], [computedSlot], () => { runs++; });
    if (writeSomethingElseFirst) cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'o')!, { n: 1 });
    db.flush();
    return runs;
};

describe('what an effect born after its computed changed is owed', () => {
    it('is owed the same whether or not something unrelated was written before the flush', () => {
        expect(runsOfAnEffectBornAfterTheChange(true)).toBe(runsOfAnEffectBornAfterTheChange(false));
    });

    it('is owed nothing, as an effect over the root itself is', () => {
        expect(runsOfAnEffectBornAfterTheChange(true)).toBe(0);
    });
});
