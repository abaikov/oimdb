import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMComputedSources } from '../types/TOIMComputedSources';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../createOIMSingleComputedService';

type TRow = { id: string; n: number };

const rowsOn = (db: OIMDB) => createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TRow, string>(db) });

const numberComputedOn = (db: OIMDB, derive: () => number, createSources: () => Partial<TOIMComputedSources>) => {
    const computedService = createOIMSingleComputedService<number>({ sameValueGuard: oimSameValueZeroGuard });
    const computed = computedService.createComputedStoreSlot(db, derive, createSources);
    const computedReads = {
        getSingleSlot: (storeSlot: typeof computed) => computedService.computedSingleSlotService.getSingleSlot(storeSlot),
        getSingleValue: (storeSlot: typeof computed) => {
            const computedSlot = computedService.computedSingleSlotService.getSingleSlot(storeSlot);
            return computedSlot.computedValueService.getValueForSlot(computedSlot);
        },
    };
    return { computedService: computedReads, computed };
};

describe('a node over a graph it does not own', () => {
    it('runs in the frame that dirtied a dependency two derivations deep', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const rowsService = rowsOn(db);
        const rows = rowsService.createStoreSlot(db);
        rowsService.writeSlotContentByKey(rows, ((row: TRow) => row.id)({ id: 'r1', n: 1 }), { id: 'r1', n: 1 });
        db.flush();
        const slot = rowsService.getSlotByKey(rows, 'r1');

        const { computedService: baseService, computed: base } = numberComputedOn(
            db, () => slot.entity?.n ?? 0, () => ({ sourceSlots: [slot] }),
        );
        const { computedService: deepService, computed: deep } = numberComputedOn(
            db,
            () => baseService.getSingleValue(base) * 10,
            () => ({ sourceComputeds: [baseService.getSingleSlot(base)] }),
        );

        let ran = 0;
        const node = effectService.createEffect(db, () => { ran++; }, [], [deepService.getSingleSlot(deep)]);

        rowsService.slotContentService.updateEntity(rowsService.findSlotByKey(rows, 'r1')!, { n: 2 });
        db.flush();

        // Built at level 1 over a level-2 dependency, this was 0: `deep` ran and
        // pushed the node into the level-1 list the drain had emptied one
        // iteration earlier, where nothing was ever going to look at it again.
        // There is one list now and the node is registered in `slot` — the root
        // under both derivations — so a write reaches it in one hop.
        expect(ran).toBe(1);
        expect(deepService.getSingleValue(deep)).toBe(20);
        effectService.disposeEffect(node);
    });

    /**
     * THE SECOND CASE, AND ITS ANSWER CHANGED. It asserted `[2, 10]` — TWO runs,
     * the first on the value the derivation still held from the previous frame
     * and the second from the fixed point re-running the node once the derivation
     * had settled; the fixed point cost a run rather than an ordering.
     *
     * The node is enlisted ONCE however many of its roots moved — the dedup
     * is its own frame stamp — and it settles its derivations itself, at the top
     * of its own `run`, before deciding whether the body is owed. So `[2, 10]` is
     * unreachable: there is no arrangement in which this body is handed a value
     * its own `run` has not just settled.
     */
    it('runs once over a source and a derivation, on the derivation\'s settled value', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const rowsService = rowsOn(db);
        const rows = rowsService.createStoreSlot(db);
        const ticksService = rowsOn(db);
        const ticks = ticksService.createStoreSlot(db);
        rowsService.writeSlotContentByKey(rows, ((row: TRow) => row.id)({ id: 'r1', n: 1 }), { id: 'r1', n: 1 });
        ticksService.writeSlotContentByKey(ticks, ((row: TRow) => row.id)({ id: 't1', n: 0 }), { id: 't1', n: 0 });
        db.flush();
        const row = rowsService.getSlotByKey(rows, 'r1');
        const tick = ticksService.getSlotByKey(ticks, 't1');

        const { computedService: doubledService, computed: doubled } = numberComputedOn(
            db, () => (row.entity?.n ?? 0) * 2, () => ({ sourceSlots: [row] }),
        );

        const seen: number[] = [];
        const node = effectService.createEffect(db, () => { seen.push(doubledService.getSingleValue(doubled)); }, [tick], [doubledService.getSingleSlot(doubled)]);

        // The tick is written FIRST, so the node is listed by a root that is not
        // the derivation's.
        ticksService.slotContentService.updateEntity(ticksService.findSlotByKey(ticks, 't1')!, { n: 1 });
        rowsService.slotContentService.updateEntity(rowsService.findSlotByKey(rows, 'r1')!, { n: 5 });
        db.flush();

        expect(seen).toEqual([10]);
        expect(seen[seen.length - 1]).toBe(doubledService.getSingleValue(doubled));
        effectService.disposeEffect(node);
    });
});
