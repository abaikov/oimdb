import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

/** `deckId` is optional, which is what puts it on a model class's prototype. */
type TCard = { id: string; deckId?: string; title?: string };

/**
 * A rehydrated row. `id` is a parameter property and lands on the INSTANCE;
 * `deckId` is defined on the PROTOTYPE, enumerable, which is what a column
 * default on a model class amounts to — a name every instance answers to and no
 * instance owns.
 */
class Card {
    public constructor(public id: string) {}
}
Object.defineProperty(Card.prototype, 'deckId', { value: 'unset', enumerable: true });

const definedColumnNamesOf = (entity: object | undefined): string[] =>
    Object.entries(entity ?? {}).filter(([, value]) => value !== undefined).map(([name]) => name);

const cardsOn = (db: OIMDB) => createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });

describe('a name only the prototype supplies does not keep a column, on a collection row', () => {
    it('takes away a column the arriving instance carries only on its prototype', () => {
        const db = new OIMDB();
        const cardsService = cardsOn(db);
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1', deckId: 'd1' });
        db.flush();

        const changed: TOIMEntitySlot<TCard, TOIMStoreKey>[] = [];
        cardsService.slotContentService.upsertEntity(cards,new Card('c1'), changed);
        db.flush();

        // `'deckId' in card` is TRUE through the prototype, so an `in` probe
        // leaves the name out of `leaving`, `deleteColumns` is never reached, and
        // the stored row keeps `d1`. The inherited name does not land either —
        // `changedColumns` refuses it — so `d1` is what every reader and every
        // index keyed on the column sees, for ever.
        expect(cardsService.getSlotByKey(cards,'c1')?.entity).toEqual({ id: 'c1' });
        expect(definedColumnNamesOf(cardsService.getSlotByKey(cards,'c1')?.entity)).toEqual(['id']);
        // AND THE WRITE SAYS SO. With the column stranded, `deleteColumns` reports
        // nothing and `putEntity` reports nothing, so the one signal a caller
        // maintaining its own index has — the `changed` array — stays empty on a
        // write that did change the row.
        expect(changed).toHaveLength(1);
    });

    it('takes away a column named after an `Object.prototype` method', () => {
        const db = new OIMDB();
        const cardsService = cardsOn(db);
        const cards = cardsService.createStoreSlot(db);
        // A stored column called `toString`: `oimIsProtoKey` flags `__proto__`
        // and nothing else, so this is an ordinary column of the row.
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1', toString: 'x' } as unknown as TCard);
        db.flush();
        expect(Object.keys(cardsService.getSlotByKey(cards,'c1')?.entity ?? {}).sort())
            .toEqual(['id', 'toString']);

        const changed: TOIMEntitySlot<TCard, TOIMStoreKey>[] = [];
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1' }, changed);
        db.flush();

        // No class anywhere: `'toString' in { id: 'c1' }` is true of the plainest
        // object a caller can hand in.
        expect(definedColumnNamesOf(cardsService.getSlotByKey(cards,'c1')?.entity)).toEqual(['id']);
        expect(changed).toHaveLength(1);
    });

    it('wakes the readers of the row whose column it took away', () => {
        const db = new OIMDB();
        const cardsService = cardsOn(db);
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1', deckId: 'd1' });
        db.flush();
        const slot = cardsService.getSlotByKey(cards,'c1')!;
        let runCount = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { runCount++; });
        db.flush();
        runCount = 0;

        cardsService.slotContentService.upsertEntity(cards,new Card('c1'));
        db.flush();

        // A departure is a change, and a subscriber that is not told reads a
        // column the row no longer has.
        expect(runCount).toBe(1);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });
});

describe('a name only the prototype supplies does not keep a column, on a standalone record', () => {
    it('takes away a column the arriving instance carries only on its prototype', () => {
        const db = new OIMDB();
        const recordService = createOIMSingleEntityService<TCard>(db);
        const record = recordService.createStoreSlot(db);
        recordService.slotContentService.upsertEntity(record, { id: 'c1', deckId: 'd1' });

        recordService.slotContentService.writeEntity(recordService.getSingleSlot(record), new Card('c1'));

        expect(recordService.getSingleSlot(record).entity).toEqual({ id: 'c1' });
        expect(definedColumnNamesOf(recordService.getSingleSlot(record).entity)).toEqual(['id']);
    });

    it('takes away a column named after an `Object.prototype` method', () => {
        const db = new OIMDB();
        const recordService = createOIMSingleEntityService<TCard>(db);
        const record = recordService.createStoreSlot(db);
        recordService.slotContentService.upsertEntity(record, { id: 'c1', toString: 'x' } as unknown as TCard);
        expect(Object.keys(recordService.getSingleSlot(record).entity ?? {}).sort()).toEqual(['id', 'toString']);

        recordService.slotContentService.writeEntity(recordService.getSingleSlot(record), { id: 'c1' });

        expect(definedColumnNamesOf(recordService.getSingleSlot(record).entity)).toEqual(['id']);
    });

    it('wakes the readers of the record whose column it took away', () => {
        const db = new OIMDB();
        const recordService = createOIMSingleEntityService<TCard>(db);
        const record = recordService.createStoreSlot(db);
        recordService.slotContentService.upsertEntity(record, { id: 'c1', deckId: 'd1' });
        let runCount = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [recordService.getSingleSlot(record)], [], () => { runCount++; });
        db.flush();
        runCount = 0;

        recordService.slotContentService.writeEntity(recordService.getSingleSlot(record), new Card('c1'));
        db.flush();

        expect(runCount).toBe(1);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });
});
