import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import { oimInsertEntityWithCopy } from '../../entity/utils/oimInsertEntityWithCopy';
import { oimIsSlotEmpty } from '../utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';

type TRow = { id: string; n: number };

const rowsOf = (db: OIMDB) => {
    const rowsService = createOIMEntityService<TRow>(db, {
        entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }),
        keyOf: row => row.id,
    });
    return { rowsService, rows: rowsService.createStoreSlot(db) };
};

/**
 * A SECOND collection wakes the subscriber that does the writing, so the
 * collection whose store is being asserted about starts genuinely empty.
 *
 * `refuse` runs one frame in which the body writes, and hands back what the
 * channel reported. The body's throw is handed to the channel's error policy,
 * which is the only way a consumer hears about it at all.
 */
const createFixture = () => {
    const errors: unknown[] = [];
    const db = new OIMDB({ errorPolicy: { onErrorCaught: error => { errors.push(error); } } });
    const { rowsService: triggersService, rows: triggers } = rowsOf(db);
    const { rowsService, rows } = rowsOf(db);
    triggersService.slotContentService.upsertEntity(triggers, { id: 't', n: 0 });
    db.flush();
    const trigger = triggersService.getSlotByKey(triggers, 't');
    const refuse = (body: () => void): unknown[] => {
        errors.length = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [trigger], [], body);
        triggersService.slotContentService.updateEntity(trigger, { n: 1 });
        db.flush();
        OIMEffectService.INSTANCE.disposeEffect(effect);
        return errors;
    };
    return { db, rowsService, rows, refuse };
};

const messages = (errors: readonly unknown[]): string[] => errors.map(error => (error as Error).message);

describe('an identity is not filed before its content lands', () => {
    it('files nothing for a key whose first write was refused', () => {
        const { rowsService, rows, refuse } = createFixture();

        const errors = refuse(() => { rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 }); });

        // The caller still hears the refusal they asked for — the unwind is not
        // a rescue and must not swallow it.
        expect(messages(errors)).toEqual([
            'OIMChannelService: writes are refused for the whole of a flush — onBeforeFlush and every after-each-frame handler included, not only the frame body. Write after flush() returns.',
        ]);
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });

    /**
     * The consequence that is not merely a wrong answer but a door closed for
     * good: `fill` asks whether the collection holds anything, and the stranded
     * identity made it hold something for ever.
     */
    it('leaves a bulk load still open on a collection the caller believes is empty', () => {
        const { rowsService, rows, refuse } = createFixture();

        refuse(() => { rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 }); });

        expect(() => rowsService.slotContentService.insertEntities(rows, [{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }])).not.toThrow();
        expect(rowsService.getSlotCount(rows)).toBe(2);
        expect(rowsService.getSlotByKey(rows, 'r1')?.entity).toEqual({ id: 'r1', n: 1 });
        expect(rowsService.getSlotByKey(rows, 'r2')?.entity).toEqual({ id: 'r2', n: 2 });
    });

    /**
     * A GUARD. What it pins is that the unwind does not leave
     * the store and the slot disagreeing, which is the failure a `store.remove`
     * that ran on the wrong key would produce.
     */
    it('mints one identity for the key when a write finally lands', () => {
        const { rowsService, rows, refuse } = createFixture();

        refuse(() => { rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 }); });
        const slot = rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 7 });

        expect(rowsService.getSlotCount(rows)).toBe(1);
        expect(rowsService.getSlotByKey(rows, 'r1')).toBe(slot);
        expect(slot.entity).toEqual({ id: 'r1', n: 7 });
    });

    /**
     * THE BRANCH THAT WAS NEVER BROKEN, asserted so the fix can be seen not to
     * have touched it: a refused write over a key that already has an identity
     * leaves that identity and its value exactly where they were.
     */
    it('leaves an identity that already had content alone when a later write is refused', () => {
        const { rowsService, rows, refuse } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1');

        const errors = refuse(() => { rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 2 }); });

        expect(errors).toHaveLength(1);
        expect(rowsService.getSlotCount(rows)).toBe(1);
        expect(rowsService.getSlotByKey(rows, 'r1')).toBe(slot);
        expect(slot.entity).toEqual({ id: 'r1', n: 1 });
    });

    /**
     * A HOLD IS THE OTHER MINTING DOOR, and it files the key with a reference
     * behind it — so a write refused after one was taken is not a miss at all
     * and there is nothing to unwind.
     *
     * Asserted because the blunt fix is a `catch` around the WHOLE door rather
     * than around the miss: that one unfiles a slot its holder is still holding,
     * and the next write for the key mints a second identity under it while the
     * holder goes on reading the first. The identity still goes when the hold is
     * given back, which is the only thing entitled to end it.
     */
    it('leaves a key a hold already filed alone when its first content is refused', () => {
        const { rowsService, rows, refuse } = createFixture();
        const holdingSlot = rowsService.holdSlotByKey(rows, 'r1');
        const errors = refuse(() => { rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 }); });

        expect(errors).toHaveLength(1);
        expect(rowsService.getSlotCount(rows)).toBe(1);
        expect(rowsService.getSlotByKey(rows, 'r1')).toBe(holdingSlot);
        expect(oimIsSlotEmpty(holdingSlot)).toBe(true);

        holdingSlot.owner.unholdSlot(holdingSlot);
        expect(oimIsSlotReleased(holdingSlot)).toBe(true);
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });
});

/**
 * AND THE BULK DOOR OWES THE SAME THING.
 *
 * `OIMSlotContentEntityService.fillEntities` files each key and then fills it, so a throw
 * part-way through a bulk load stranded the pair IN FLIGHT: its key filed, its
 * content never arrived, `find` answering a slot for a row nobody wrote, `size`
 * counting it, and `fill` refused for the life of the collection afterwards.
 * That is the defect above, one door across.
 *
 * IT WAS LEFT DELIBERATELY, on the cost of the obvious unwind — a `try`/`catch`
 * inside the bulk loop, or a local written per row to remember the pair in
 * flight, on the one path `fill` exists to make cheap. The shape that pays
 * neither is one `try` around the WHOLE loop with the unwind ASKING which
 * identities may go rather than remembering: `fill`'s own precondition is that
 * the collection held nothing, so everything filed when the throw arrived was
 * filed by that call, and `releaseSlotIfUnheld` keeps every row whose content landed.
 *
 * A BULK LOAD IS NOT A TRANSACTION, and the second case says so out loud: rows
 * that landed stay. What is owed is that the row that did NOT land left nothing.
 */
describe('a bulk load leaves no key filed for content that never landed', () => {
    it('files nothing at all when the first row of the bulk is refused', () => {
        const { rowsService, rows, refuse } = createFixture();

        const errors = refuse(() => { rowsService.slotContentService.insertEntities(rows, [{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }]); });

        expect(messages(errors)).toEqual([
            'OIMChannelService: writes are refused for the whole of a flush — onBeforeFlush and every after-each-frame handler included, not only the frame body. Write after flush() returns.',
        ]);
        // `r1` is refused before the loop files it, and the unwind asks which
        // identities may go rather than remembering the pair in flight.
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });

    it('keeps the rows that landed and leaves nothing for the one that threw', () => {
        const { rowsService, rows } = createFixture();
        // A ROW THAT CANNOT BE READ. `oimInsertEntityWithCopy` copies what it is
        // handed with a spread, and a spread calls a getter — so this throws inside the write of
        // the third pair, with two pairs already filed and holding their values.
        const unreadable: TRow = {
            id: 'r3',
            get n(): number { throw new Error('this row cannot be read'); },
        };

        expect(() => rowsService.slotContentService.insertEntities(rows, [{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }, unreadable]))
            .toThrow('this row cannot be read');

        expect(rowsService.getSlotCount(rows)).toBe(2);
        expect(rowsService.getSlotByKey(rows, 'r1')?.entity).toEqual({ id: 'r1', n: 1 });
        expect(rowsService.getSlotByKey(rows, 'r2')?.entity).toEqual({ id: 'r2', n: 2 });

        const landed = rowsService.slotContentService.upsertEntity(rows, { id: 'r3', n: 3 });
        expect(rowsService.getSlotByKey(rows, 'r3')).toBe(landed);
        expect(rowsService.getSlotCount(rows)).toBe(3);
    });

    it('keeps the rows before a key that cannot be read and files nothing from that row on', () => {
        const db = new OIMDB();
        const rowsService = createOIMEntityService<TRow>(db, {
            keyOf: row => {
                if (row.n < 0) throw new Error('this row has no key');
                return row.id;
            },
        });
        const rows = rowsService.createStoreSlot(db);

        expect(() => rowsService.slotContentService.insertEntities(rows, [
            { id: 'r1', n: 1 }, { id: 'r2', n: 2 }, { id: 'r3', n: -1 }, { id: 'r4', n: 4 },
        ])).toThrow('this row has no key');

        expect(rowsService.getSlotCount(rows)).toBe(2);
        expect(rowsService.findSlotByKey(rows, 'r1')?.entity).toEqual({ id: 'r1', n: 1 });
        expect(rowsService.findSlotByKey(rows, 'r2')?.entity).toEqual({ id: 'r2', n: 2 });
        expect(rowsService.findSlotByKey(rows, 'r3')).toBeUndefined();
        expect(rowsService.findSlotByKey(rows, 'r4')).toBeUndefined();
    });
});
