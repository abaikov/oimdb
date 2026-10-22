import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { OIMDB } from '../src/factories/OIMDB';
import { createOIMEntityService } from '../src/factories/createOIMEntityService';
import { OIMDefaults } from '../src/factories/OIMDefaults';
import { OIMUnusedSlotCollectorService } from '../src/engine/collector/OIMUnusedSlotCollectorService';
import { createOIMUnusedSlotCollectorSlot } from '../src/engine/collector/utils/createOIMUnusedSlotCollectorSlot';
import { OIMColumnOwnerPushDriven } from '../src/engine/column/OIMColumnOwnerPushDriven';
import type { TOIMEntitySlot } from '../src/engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../src/engine/store/types/TOIMStoreKey';
import { oimIsSlotReleased } from '../src/engine/slot/utils/oimIsSlotReleased';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const cardServiceOn = (db: OIMDB) =>
    createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });

const filedCard = (
    cardService: ReturnType<typeof cardServiceOn>, db: OIMDB,
): TCardSlot => {
    const cardStoreSlot = cardService.createStoreSlot(db);
    cardService.slotContentService.upsertEntity(cardStoreSlot, { id: 'a', title: 'A' });
    db.flush();
    return cardService.getSlotByKey(cardStoreSlot, 'a');
};

const sourceOf = (...segments: string[]): string =>
    readFileSync(join(__dirname, '..', 'src', 'engine', 'column', ...segments), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');

describe('which collector a minted column is given back to', () => {
    it('is carried by no field of the column owner, whose options name only the store and the columns', () => {
        const source = sourceOf('OIMColumnOwner.ts');
        const optionsSource = sourceOf('types', 'TOIMColumnOwnerOptions.ts');

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

        const column = cardService.getColumn(card, 'title');
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
        const columnOwner = new OIMColumnOwnerPushDriven({ columnSlotStoreService: OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue() });

        const column = columnOwner.getColumn(card, 'title', unusedSlotCollectorSlot);
        expect(column.holdCount).toBe(1);

        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(column.holdCount).toBe(1);
        expect(oimIsSlotReleased(column)).toBe(false);

        OIMUnusedSlotCollectorService.INSTANCE.flush(unusedSlotCollectorSlot);
        expect(column.holdCount).toBe(0);
        expect(oimIsSlotReleased(column)).toBe(true);
    });
});
