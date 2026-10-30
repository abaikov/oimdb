import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { OIMDB } from '../src/db/OIMDB';
import { OIMDefaults } from '../src/db/OIMDefaults';
import { OIMUnusedSlotCollectorService } from '../src/collector/OIMUnusedSlotCollectorService';
import { createOIMUnusedSlotCollectorSlot } from '../src/collector/utils/createOIMUnusedSlotCollectorSlot';
import { OIMPushColumnSlotOwner } from '../src/column/OIMPushColumnSlotOwner';
import type { TOIMEntitySlot } from '../src/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../src/store/types/TOIMStoreKey';
import { oimIsSlotReleased } from '../src/slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../src/entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../src/slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const cardServiceOn = (db: OIMDB) =>
    createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });

const filedCard = (
    cardService: ReturnType<typeof cardServiceOn>, db: OIMDB,
): TCardSlot => {
    const cardStoreSlot = cardService.createStoreSlot(db);
    cardService.writeSlotContentByKey(cardStoreSlot, ((card: TCard) => card.id)({ id: 'a', title: 'A' }), { id: 'a', title: 'A' });
    db.flush();
    return cardService.getSlotByKey(cardStoreSlot, 'a');
};

const sourceOf = (...segments: string[]): string =>
    readFileSync(join(__dirname, '..', 'src', 'column', ...segments), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');

describe('which collector a minted column is given back to', () => {
    it('is carried by no field of the column owner, whose options name only the store and the columns', () => {
        const source = sourceOf('OIMColumnSlotOwner.ts');
        const optionsSource = sourceOf('types', 'TOIMColumnSlotOwnerOptions.ts');

        expect(source).not.toMatch(/^ {4}(?:public |private |protected )?(?:readonly )?unusedSlotCollector/m);
        expect(optionsSource).not.toContain('unusedSlotCollector');
        expect(optionsSource).toMatch(
            /\|\s*\{\s*columnSlotStoreService: [^;]+;\s*columnNames\?: undefined\s*\}\s*\|\s*\{\s*columnNames: [^;]+;\s*columnSlotStoreService\?: undefined\s*\}/,
        );
    });

    it('is the collector the caller named, and the channel gives that one back', () => {
        const db = new OIMDB();
        const cardService = cardServiceOn(db);
        const card = filedCard(cardService, db);

        const column = cardService.columnSlotService.getColumn(card, 'title');
        expect(column.holdCount).toBe(1);

        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(column.holdCount).toBe(0);
        expect(oimIsSlotReleased(column)).toBe(true);
    });

    it('is a collector nothing flushes when the caller names one, and the hold then never comes back', () => {
        const db = new OIMDB();
        const cardService = cardServiceOn(db);
        const card = filedCard(cardService, db);
        const unusedSlotCollectorSlot = createOIMUnusedSlotCollectorSlot();
        const columnSlotOwner = new OIMPushColumnSlotOwner({ columnSlotStoreService: OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue() });

        const column = columnSlotOwner.getColumn(card, 'title', unusedSlotCollectorSlot);
        expect(column.holdCount).toBe(1);

        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(column.holdCount).toBe(1);
        expect(oimIsSlotReleased(column)).toBe(false);

        OIMUnusedSlotCollectorService.INSTANCE.flush(unusedSlotCollectorSlot);
        expect(column.holdCount).toBe(0);
        expect(oimIsSlotReleased(column)).toBe(true);
    });
});
