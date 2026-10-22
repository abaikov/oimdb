import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { IOIMSlotEmptiness } from '../interfaces/IOIMSlotEmptiness';
import type { IOIMSlotStamp } from '../interfaces/IOIMSlotStamp';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMSlot } from '../types/TOIMSlot';

type TRow = { id: string; n: number };

type TSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

const createFixture = () => {
    let stamped = 0;
    let asked = 0;
    const slotStamp: IOIMSlotStamp<TOIMSlot> = { stamp: () => { stamped++; } };
    const emptiness: IOIMSlotEmptiness<TSlot> = {
        isEmpty: slot => { asked++; return slot.entity === undefined; },
    };
    const db = new OIMDB({ slotStamp });
    const rowsService = createOIMEntityService<TRow>(db, {
        keyOf: row => row.id,
        slotEmptiness: emptiness,
    });
    const rows = rowsService.createStoreSlot(db);
    return { rowsService, rows, stamps: () => stamped, emptinessAsks: () => asked };
};

describe('what one insert stamps', () => {
    it('stamps the identity once for a key that had none', () => {
        const { rowsService, rows, stamps, emptinessAsks } = createFixture();

        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });

        expect(stamps()).toBe(1);
        expect(emptinessAsks()).toBe(1);
    });

    it('stamps once more for every later write on the same key', () => {
        const { rowsService, rows, stamps } = createFixture();

        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 2 });
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 3 });

        expect(stamps()).toBe(3);
    });

    it('stamps the identity a read minted, and once more when content lands on it', () => {
        const { rowsService, rows, stamps } = createFixture();

        rowsService.getSlotByKey(rows, 'r1');
        expect(stamps()).toBe(1);

        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        expect(stamps()).toBe(2);
    });
});
