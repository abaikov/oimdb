import { OIMDB } from '../../db/OIMDB';
import { oimIsSlotEmpty } from '../utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import { OIM_DEFAULT_ENTITY_SLOT_EMPTINESS_POLICY } from '../../db/constants/OIM_DEFAULT_ENTITY_SLOT_EMPTINESS_POLICY';
import type { IOIMSlotEmptinessPolicy } from '../interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const createFixture = () => {
    const db = new OIMDB();
    let asked = 0;
    const emptiness: IOIMSlotEmptinessPolicy<TCardSlot> = {
        isEmpty: slot => {
            asked++;
            return OIM_DEFAULT_ENTITY_SLOT_EMPTINESS_POLICY.getValue().isEmpty(slot);
        },
    };
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db, { slotEmptinessPolicy: emptiness }) });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards, asked: () => asked };
};

describe('how many times a removal asks whether the row is empty', () => {
    it('asks once for a row it takes out', () => {
        const fixture = createFixture();
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'a', { id: 'a', title: 'A' });
        fixture.db.flush();
        const before = fixture.asked();

        const slot = fixture.cardsService.findSlotByKey(fixture.cards, 'a');
        if (slot !== undefined) fixture.cardsService.slotContentService.clearSlotContent(slot);

        expect(fixture.asked() - before).toBe(1);
    });

    it('asks once per row of a batch it takes out', () => {
        const fixture = createFixture();
        fixture.cardsService.writeInBatch(fixture.cards, () => ([
            { id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' },
        ]).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();
        const before = fixture.asked();

        const slots = ['a', 'b', 'c'].flatMap(key => fixture.cardsService.findSlotByKey(fixture.cards, key) ?? []);
        fixture.cardsService.writeInBatch(fixture.cards, () => { for (const entitySlot of slots) fixture.cardsService.slotContentService.clearSlotContent(entitySlot); });

        expect(fixture.asked() - before).toBe(3);
    });

    it('leaves the row gone and its key free', () => {
        const fixture = createFixture();
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'a', { id: 'a', title: 'A' });
        fixture.db.flush();

        const slot = fixture.cardsService.findSlotByKey(fixture.cards, 'a');
        if (slot !== undefined) fixture.cardsService.slotContentService.clearSlotContent(slot);
        fixture.db.flush();

        expect(fixture.cardsService.hasSlotContentByKey(fixture.cards, 'a')).toBe(false);
        expect(fixture.cardsService.findSlotByKey(fixture.cards, 'a')?.entity).toBeUndefined();
    });

    it('keeps a row given back while it still holds a value, and keeps saying it is not empty', () => {
        const fixture = createFixture();
        const held = fixture.cardsService.holdSlotByKey(fixture.cards, 'a');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'a', { id: 'a', title: 'A' });
        fixture.db.flush();

        held.owner.unholdSlot(held);
        fixture.db.flush();

        expect(oimIsSlotReleased(held)).toBe(false);
        expect(oimIsSlotEmpty(held)).toBe(false);
        expect(fixture.cardsService.hasSlotContentByKey(fixture.cards, 'a')).toBe(true);
    });

    it('says a row is empty once the value it kept is taken out', () => {
        const fixture = createFixture();
        const held = fixture.cardsService.holdSlotByKey(fixture.cards, 'a');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'a', { id: 'a', title: 'A' });
        fixture.db.flush();

        fixture.cardsService.slotContentService.clearSlotContent(held);
        fixture.db.flush();

        expect(oimIsSlotEmpty(held)).toBe(true);
        expect(fixture.cardsService.findSlotByKey(fixture.cards, 'a')?.entity).toBeUndefined();
    });
});
