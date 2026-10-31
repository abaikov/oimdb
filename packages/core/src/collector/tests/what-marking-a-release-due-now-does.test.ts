import { OIMDefaults } from '../../db/OIMDefaults';
import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMSlotAfterWriteReleasePolicy } from '../OIMSlotAfterWriteReleasePolicy';
import { OIMSlotReleaseManualDueFramePolicy } from '../OIMSlotReleaseManualDueFramePolicy';
import { oimMintAfterWriteSlotReleaseWheel } from '../utils/oimMintAfterWriteSlotReleaseWheel';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TRow = { id: string; n: number };

const START_MS = 1_000_000;
const KEEP_MS = 60_000;

const createWorld = () => {
    let nowMs = START_MS;
    const slotReleaseDueFramePolicy = new OIMSlotReleaseManualDueFramePolicy();
    const defaults = new OIMDefaults({ slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: KEEP_MS, slotReleaseDueFramePolicy }) });
    const db = new OIMDB({ getNowMs: () => nowMs, releaseTimer: () => () => undefined });
    const rowsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TRow, string>({ defaults }) });
    const rows = rowsService.createStoreSlot(db);
    const slot = rowsService.holdSlotByKey(rows, 'r');
    slotReleaseDueFramePolicy.writeInSlotReleaseDueFrame(() => { rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', n: 0 }); });
    db.flush();
    return {
        db, rowsService, rows, slot, slotReleaseDueFramePolicy,
        afterWriteSlotReleaseWheel: oimMintAfterWriteSlotReleaseWheel(db.collectorSlot),
        advance: (ms: number): void => { nowMs += ms; },
    };
};

describe('what marking a release due now does', () => {
    it('lets a slot nothing holds or watches go at once', () => {
        const world = createWorld();
        world.slot.owner.unholdSlot(world.slot);
        world.advance(1_000);

        world.afterWriteSlotReleaseWheel.markSlotReleaseDueNow(world.slot);

        expect(oimIsSlotReleased(world.slot)).toBe(true);
        expect(world.rowsService.getSlotCount(world.rows)).toBe(0);
    });

    it('keeps a watched slot with its data, and lets it go once its last subscriber leaves', () => {
        const world = createWorld();
        const effect = OIMEffectService.INSTANCE.createEffect(world.db, () => undefined, [world.slot]);
        world.slot.owner.unholdSlot(world.slot);
        world.advance(1_000);

        world.afterWriteSlotReleaseWheel.markSlotReleaseDueNow(world.slot);

        expect(oimIsSlotReleased(world.slot)).toBe(false);
        expect(world.slot.releaseDueAfterWriteMs).toBe(START_MS + 1_000);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        expect(oimIsSlotReleased(world.slot)).toBe(true);
    });

    it('is undone by the next marked write, which moves the deadline a window ahead again', () => {
        const world = createWorld();
        world.advance(1_000);
        world.afterWriteSlotReleaseWheel.markSlotReleaseDueNow(world.slot);

        world.advance(1_000);
        world.slotReleaseDueFramePolicy.writeInSlotReleaseDueFrame(() => {
            world.rowsService.writeSlotContentByKey(world.rows, 'r', { id: 'r', n: 1 });
        });

        expect(world.slot.releaseDueAfterWriteMs).toBe(START_MS + 2_000 + KEEP_MS);
        world.slot.owner.unholdSlot(world.slot);
        expect(oimIsSlotReleased(world.slot)).toBe(false);
    });
});
