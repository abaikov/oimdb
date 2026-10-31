import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import { OIMSlotAfterWriteReleasePolicy } from '../../collector/OIMSlotAfterWriteReleasePolicy';
import { oimMintAfterWriteSlotReleaseWheel } from '../../collector/utils/oimMintAfterWriteSlotReleaseWheel';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

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
    const afterWriteSlotReleaseWheel = oimMintAfterWriteSlotReleaseWheel(db.collectorSlot);
    const triggersService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TRow, string>() });
    const triggers = triggersService.createStoreSlot(db);
    const rowsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TRow, string>(), slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: WINDOW }) });
    const rows = rowsService.createStoreSlot(db);
    triggersService.writeSlotContentByKey(triggers, 't', { id: 't', n: 0 });
    db.flush();
    const trigger = triggersService.getSlotByKey(triggers, 't');
    const refuse = (body: () => void): unknown[] => {
        errors.length = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, body, [trigger]);
        triggersService.slotContentService.updateEntity(trigger, { n: 1 });
        db.flush();
        OIMEffectService.INSTANCE.disposeEffect(effect);
        return errors;
    };
    return {
        db, afterWriteSlotReleaseWheel, rowsService, rows, refuse, at: (value: number): void => { ms = value; },
    };
};

describe('a key whose first write was refused', () => {
    it('leaves nothing on the release clock, so no later sweep ever meets it', () => {
        const fixture = createFixture();
        expect(fixture.afterWriteSlotReleaseWheel.getNextSliceNumber()).toBeUndefined();

        const errors = fixture.refuse(() => { fixture.rowsService.writeSlotContentByKey(fixture.rows, 'r1', { id: 'r1', n: 1 }); });

        expect(errors).toHaveLength(1);
        expect(fixture.rowsService.getSlotCount(fixture.rows)).toBe(0);
        expect(fixture.afterWriteSlotReleaseWheel.getNextSliceNumber()).toBeUndefined();
    });

    it('is filed on that clock again when a write finally lands, and goes at its deadline', () => {
        const fixture = createFixture();
        fixture.refuse(() => { fixture.rowsService.writeSlotContentByKey(fixture.rows, 'r1', { id: 'r1', n: 1 }); });

        const slot = fixture.rowsService.writeSlotContentByKey(fixture.rows, 'r1', { id: 'r1', n: 7 });

        expect(fixture.afterWriteSlotReleaseWheel.isSlotReleaseScheduled(slot)).toBe(true);

        fixture.at(START + WINDOW + 1_000);
        fixture.afterWriteSlotReleaseWheel.flush();

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.rowsService.getSlotCount(fixture.rows)).toBe(0);
        expect(fixture.afterWriteSlotReleaseWheel.isSlotReleaseScheduled(slot)).toBe(false);
    });
});
