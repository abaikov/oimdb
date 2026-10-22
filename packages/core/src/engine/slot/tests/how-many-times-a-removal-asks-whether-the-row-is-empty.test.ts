import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { oimIsSlotEmpty } from '../utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import { OIM_DEFAULT_ENTITY_SLOT_EMPTINESS } from '../../../factories/defaults/OIM_DEFAULT_ENTITY_SLOT_EMPTINESS';
import type { IOIMSlotEmptiness } from '../interfaces/IOIMSlotEmptiness';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const createFixture = () => {
    const db = new OIMDB();
    let asked = 0;
    const emptiness: IOIMSlotEmptiness<TCardSlot> = {
        isEmpty: slot => {
            asked++;
            return OIM_DEFAULT_ENTITY_SLOT_EMPTINESS.getValue().isEmpty(slot);
        },
    };
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotEmptiness: emptiness,
    });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards, asked: () => asked };
};

describe('how many times a removal asks whether the row is empty', () => {
    it('asks once for a row it takes out', () => {
        const fixture = createFixture();
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'a', title: 'A' });
        fixture.db.flush();
        const before = fixture.asked();

        const slot = fixture.cardsService.findSlotByKey(fixture.cards, 'a');
        if (slot !== undefined) fixture.cardsService.slotContentService.deleteEntity(slot);

        expect(fixture.asked() - before).toBe(1);
    });

    it('asks once per row of a batch it takes out', () => {
        const fixture = createFixture();
        fixture.cardsService.slotContentService.upsertEntities(fixture.cards, [
            { id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' },
        ]);
        fixture.db.flush();
        const before = fixture.asked();

        const slots = ['a', 'b', 'c'].flatMap(key => fixture.cardsService.findSlotByKey(fixture.cards, key) ?? []);
        fixture.cardsService.slotContentService.deleteEntities(fixture.cards, slots);

        expect(fixture.asked() - before).toBe(3);
    });

    it('leaves the row gone and its key free', () => {
        const fixture = createFixture();
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'a', title: 'A' });
        fixture.db.flush();

        const slot = fixture.cardsService.findSlotByKey(fixture.cards, 'a');
        if (slot !== undefined) fixture.cardsService.slotContentService.deleteEntity(slot);
        fixture.db.flush();

        expect(fixture.cardsService.hasSlotContentByKey(fixture.cards, 'a')).toBe(false);
        expect(fixture.cardsService.slotContentService.findEntityByKey(fixture.cards, 'a')).toBeUndefined();
    });

    it('keeps a row given back while it still holds a value, and keeps saying it is not empty', () => {
        const fixture = createFixture();
        const held = fixture.cardsService.holdSlotByKey(fixture.cards, 'a');
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'a', title: 'A' });
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
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'a', title: 'A' });
        fixture.db.flush();

        fixture.cardsService.slotContentService.deleteEntity(held);
        fixture.db.flush();

        expect(oimIsSlotEmpty(held)).toBe(true);
        expect(fixture.cardsService.slotContentService.findEntityByKey(fixture.cards, 'a')).toBeUndefined();
    });
});
