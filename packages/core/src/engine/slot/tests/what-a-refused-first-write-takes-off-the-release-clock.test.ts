import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMReleaseSlotCollectorServiceAfterWrite } from '../../collector/OIMReleaseSlotCollectorServiceAfterWrite';
import { OIMReleaseSlotQueueService } from '../../collector/OIMReleaseSlotQueueService';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import { OIMSlotReleasePolicyAfterWrite } from '../../collector/OIMSlotReleasePolicyAfterWrite';

type TRow = { id: string; n: number };

const START = 1_000_000;
const WINDOW = 30_000;

const createFixture =() => {
    let ms = START;
    const errors: unknown[] = [];
    const db = new OIMDB({
        errorPolicy: { onErrorCaught: error => { errors.push(error); } },
        getNowMs: () => ms,
        releaseTimer: () => () => undefined,
    });
    const afterWriteReleaseSlotCollectorSlot = db.collectorSlot.afterWriteReleaseSlotCollectorSlot;
    const triggersService = createOIMEntityService<TRow>(db, { keyOf: row => row.id });
    const triggers = triggersService.createStoreSlot(db);
    const rowsService = createOIMEntityService<TRow>(db, {
        keyOf: row => row.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: WINDOW }),
    });
    const rows = rowsService.createStoreSlot(db);
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
    return {
        db, afterWriteReleaseSlotCollectorSlot, rowsService, rows, refuse, at: (value: number): void => { ms = value; },
    };
};

describe('a key whose first write was refused', () => {
    it('leaves nothing on the release clock, so no later sweep ever meets it', () => {
        const fixture = createFixture();
        const queueService = OIMReleaseSlotQueueService.INSTANCE;
        expect(queueService.getNextReleaseSliceNumber(fixture.afterWriteReleaseSlotCollectorSlot)).toBeUndefined();

        const errors = fixture.refuse(() => { fixture.rowsService.slotContentService.upsertEntity(fixture.rows, { id: 'r1', n: 1 }); });

        expect(errors).toHaveLength(1);
        expect(fixture.rowsService.getSlotCount(fixture.rows)).toBe(0);
        expect(queueService.getNextReleaseSliceNumber(fixture.afterWriteReleaseSlotCollectorSlot)).toBeUndefined();
    });

    it('is filed on that clock again when a write finally lands, and goes at its deadline', () => {
        const fixture = createFixture();
        const queueService = OIMReleaseSlotQueueService.INSTANCE;
        fixture.refuse(() => { fixture.rowsService.slotContentService.upsertEntity(fixture.rows, { id: 'r1', n: 1 }); });

        const slot = fixture.rowsService.slotContentService.upsertEntity(fixture.rows, { id: 'r1', n: 7 });

        expect(queueService.isSlotReleaseScheduled(fixture.afterWriteReleaseSlotCollectorSlot, slot)).toBe(true);

        fixture.at(START + WINDOW + 1_000);
        OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.flush(fixture.afterWriteReleaseSlotCollectorSlot);

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.rowsService.getSlotCount(fixture.rows)).toBe(0);
        expect(queueService.isSlotReleaseScheduled(fixture.afterWriteReleaseSlotCollectorSlot, slot)).toBe(false);
    });
});
