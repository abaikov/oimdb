import { OIMDefaults } from '../../db/OIMDefaults';
import { OIMDB } from '../../db/OIMDB';
import { OIMSlotAfterWriteReleasePolicy } from '../OIMSlotAfterWriteReleasePolicy';
import { OIMSlotReleaseManualDueFramePolicy } from '../OIMSlotReleaseManualDueFramePolicy';
import { oimMintAfterWriteSlotReleaseWheel } from '../utils/oimMintAfterWriteSlotReleaseWheel';
import type { IOIMSlotReleasePolicy } from '../interfaces/IOIMSlotReleasePolicy';
import type { TOIMTimer } from '../../schedule/types/TOIMTimer';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TRow = { id: string; n: number };

const START_MS = 1_000_000;

const createWorld = (slotReleasePolicy: IOIMSlotReleasePolicy) => {
    let nowMs = START_MS;
    const releaseTimer: TOIMTimer = () => () => undefined;
    const defaults = new OIMDefaults({ slotReleasePolicy });
    const db = new OIMDB({ getNowMs: () => nowMs, releaseTimer });
    const rowsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMSlotContentEntityService<TRow, string>({ defaults }) });
    const rows = rowsService.createStoreSlot(db);
    return {
        db,
        rowsService,
        write: (row: TRow): TOIMSlot => rowsService.writeSlotContentByKey(rows, row.id, row),
        advance: (ms: number): void => { nowMs += ms; },
    };
};

describe('which writes move the write deadline', () => {
    it('every write moves it by default', () => {
        const world = createWorld(new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 30_000 }));
        const slot = world.write({ id: 'r', n: 0 });
        world.advance(5_000);
        world.write({ id: 'r', n: 1 });

        expect(oimMintAfterWriteSlotReleaseWheel(world.db.collectorSlot).getReleaseDueMs(slot)).toBe(START_MS + 5_000 + 30_000);
    });

    it('under a manual frame strategy only a write inside an open frame moves it', () => {
        const slotReleaseDueFramePolicy = new OIMSlotReleaseManualDueFramePolicy();
        const world = createWorld(new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 30_000, slotReleaseDueFramePolicy }));
        let slot: TOIMSlot | undefined;
        slotReleaseDueFramePolicy.openSlotReleaseDueFrame();
        slot = world.write({ id: 'r', n: 0 });
        slotReleaseDueFramePolicy.closeSlotReleaseDueFrame();
        world.advance(5_000);
        slot = world.write({ id: 'r', n: 1 });

        expect(oimMintAfterWriteSlotReleaseWheel(world.db.collectorSlot).getReleaseDueMs(slot)).toBe(START_MS + 30_000);
    });

    it('the function form opens the frame around the write and closes it after, also on a throw', () => {
        const slotReleaseDueFramePolicy = new OIMSlotReleaseManualDueFramePolicy();
        const world = createWorld(new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 30_000, slotReleaseDueFramePolicy }));
        let slot: TOIMSlot | undefined;
        slotReleaseDueFramePolicy.writeInSlotReleaseDueFrame(() => { slot = world.write({ id: 'r', n: 0 }); });

        expect(() => slotReleaseDueFramePolicy.writeInSlotReleaseDueFrame(() => { throw new Error('the write threw'); }))
            .toThrow('the write threw');

        expect(slotReleaseDueFramePolicy.isSlotReleaseDueFrameOpen()).toBe(false);
        expect(oimMintAfterWriteSlotReleaseWheel(world.db.collectorSlot).getReleaseDueMs(slot as TOIMSlot)).toBe(START_MS + 30_000);
    });

    it('one manual frame moves the deadline of every policy that shares it, each by its own window', () => {
        const slotReleaseDueFramePolicy = new OIMSlotReleaseManualDueFramePolicy();
        const world = createWorld(new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 30_000, slotReleaseDueFramePolicy }));
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TRow, string>(), slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 60_000, slotReleaseDueFramePolicy }) });
        const cards = cardsService.createStoreSlot(world.db);
        let deckSlot: TOIMSlot | undefined;
        let cardSlot: TOIMSlot | undefined;

        slotReleaseDueFramePolicy.writeInSlotReleaseDueFrame(() => {
            deckSlot = world.write({ id: 'deck', n: 0 });
            cardSlot = cardsService.writeSlotContentByKey(cards, 'card', { id: 'card', n: 0 });
        });

        expect(oimMintAfterWriteSlotReleaseWheel(world.db.collectorSlot).getReleaseDueMs(deckSlot as TOIMSlot)).toBe(START_MS + 30_000);
        expect(oimMintAfterWriteSlotReleaseWheel(world.db.collectorSlot).getReleaseDueMs(cardSlot as TOIMSlot)).toBe(START_MS + 60_000);
    });

    it('closing a frame that is not open throws by name', () => {
        expect(() => new OIMSlotReleaseManualDueFramePolicy().closeSlotReleaseDueFrame())
            .toThrow('OIMSlotReleaseManualDueFramePolicy.closeSlotReleaseDueFrame: no frame is open.');
    });
});
