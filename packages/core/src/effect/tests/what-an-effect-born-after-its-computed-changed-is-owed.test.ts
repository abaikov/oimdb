import { OIMDB, OIMEffectService } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../index';

type TCard = { id: string; n: number };

const runsOfAnEffectBornAfterTheChange = (writeSomethingElseFirst: boolean): number => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const source = cardsService.writeSlotContentByKey(cards, 's', { id: 's', n: 0 });
    cardsService.writeSlotContentByKey(cards, 'o', { id: 'o', n: 0 });
    const valueOfSourceService = createOIMSingleComputedService<number>();
    const valueOfSource = valueOfSourceService.createComputedStoreSlot(
        db, () => source.entity?.n ?? -1, () => ({ sourceSlots: [source] }),
    );
    const computedSlot = valueOfSourceService.computedSingleSlotService.holdSingleSlot(valueOfSource);
    computedSlot.computedValueService.getValueForSlot(computedSlot);
    db.flush();
    cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 's')!, { n: 1 });
    let runs = 0;
    effectService.createEffect(db, () => { runs++; }, [], [computedSlot]);
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
