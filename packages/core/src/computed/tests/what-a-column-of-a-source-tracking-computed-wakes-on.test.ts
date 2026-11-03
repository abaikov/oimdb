import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleSourceTrackingComputedService } from '../createOIMSingleSourceTrackingComputedService';

type TCell = { id: string; useB?: boolean; n?: number };
type TPicked = { picked: number };

function setUp() {
    const db = new OIMDB();
    const cellsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCell, string>() });
    const cells = cellsService.createStoreSlot(db);
    const flag = cellsService.writeSlotContentByKey(cells, 'flag', { id: 'flag', useB: false });
    const a = cellsService.writeSlotContentByKey(cells, 'a', { id: 'a', n: 1 });
    const b = cellsService.writeSlotContentByKey(cells, 'b', { id: 'b', n: 10 });
    const pickedService = createOIMSingleSourceTrackingComputedService<TPicked>({
        derive: () => ({ picked: ((flag.entity?.useB === true ? b : a).entity?.n) ?? 0 }),
    });
    const picked = pickedService.createStoreSlot(db);
    db.flush();
    const pickedColumn = pickedService.getSingleSlot(picked).holdColumnSlot('picked');
    return { db, cellsService, flag, b, pickedColumn };
}

describe('a column of a source-tracking computed', () => {
    it('wakes an effect that names it as a source-tracking source from the source the carrier switched to', () => {
        const { db, cellsService, flag, b, pickedColumn } = setUp();
        const seen: unknown[] = [];
        OIMEffectService.INSTANCE.createAndRunEffect(db, () => { seen.push(pickedColumn.value); }, [], [], [pickedColumn]);

        cellsService.slotContentService.updateEntity(flag, { useB: true });
        db.flush();
        cellsService.slotContentService.updateEntity(b, { n: 20 });
        db.flush();

        expect(seen).toEqual([1, 10, 20]);
    });

    it('is refused at the type level by the list whose roots are fixed at creation', () => {
        const { db, pickedColumn } = setUp();

        // @ts-expect-error a column of a source-tracking computed has roots that move with its carrier
        const effect = OIMEffectService.INSTANCE.createAndRunEffect(db, () => undefined, [], [pickedColumn]);
        OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(effect).toBeDefined();
    });
});
