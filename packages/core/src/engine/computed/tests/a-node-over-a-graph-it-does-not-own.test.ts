import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../OIMEffectService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMComputedSources } from '../types/TOIMComputedSources';

type TRow = { id: string; n: number };

const rowsOn = (db: OIMDB) => createOIMEntityService<TRow>(db, { keyOf: (row: TRow) => row.id });

const numberComputedOn = (db: OIMDB, derive: () => number, createSources: () => Partial<TOIMComputedSources>) => {
    const computedService = createOIMComputedService<void, number>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        sameValueGuard: oimSameValueZeroGuard,
    });
    const computed = computedService.createComputedStoreSlot(db, derive, createSources);
    const computedReads = {
        getSlotByKey: (storeSlot: typeof computed, key: undefined) => computedService.computedCollectionService.getSlotByKey(storeSlot, key),
        getValueByKey: (storeSlot: typeof computed, key: undefined) => {
            const computedSlot = computedService.computedCollectionService.getSlotByKey(storeSlot, key);
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
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        db.flush();
        const slot = rowsService.getSlotByKey(rows, 'r1');

        const { computedService: baseService, computed: base } = numberComputedOn(
            db, () => slot.entity?.n ?? 0, () => ({ sourceSlots: [slot] }),
        );
        const { computedService: deepService, computed: deep } = numberComputedOn(
            db,
            () => baseService.getValueByKey(base, undefined) * 10,
            () => ({ sourceComputeds: [baseService.getSlotByKey(base, undefined)] }),
        );

        let ran = 0;
        const node = effectService.createEffect(db, [], [deepService.getSlotByKey(deep, undefined)], () => { ran++; });

        rowsService.slotContentService.updateEntity(rowsService.findSlotByKey(rows, 'r1')!, { n: 2 });
        db.flush();

        // Built at level 1 over a level-2 dependency, this was 0: `deep` ran and
        // pushed the node into the level-1 list the drain had emptied one
        // iteration earlier, where nothing was ever going to look at it again.
        // There is one list now and the node is registered in `slot` — the root
        // under both derivations — so a write reaches it in one hop.
        expect(ran).toBe(1);
        expect(deepService.getValueByKey(deep, undefined)).toBe(20);
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
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        ticksService.slotContentService.upsertEntity(ticks, { id: 't1', n: 0 });
        db.flush();
        const row = rowsService.getSlotByKey(rows, 'r1');
        const tick = ticksService.getSlotByKey(ticks, 't1');

        const { computedService: doubledService, computed: doubled } = numberComputedOn(
            db, () => (row.entity?.n ?? 0) * 2, () => ({ sourceSlots: [row] }),
        );

        const seen: number[] = [];
        const node = effectService.createEffect(db, [tick], [doubledService.getSlotByKey(doubled, undefined)], () => { seen.push(doubledService.getValueByKey(doubled, undefined)); });

        // The tick is written FIRST, so the node is listed by a root that is not
        // the derivation's.
        ticksService.slotContentService.updateEntity(ticksService.findSlotByKey(ticks, 't1')!, { n: 1 });
        rowsService.slotContentService.updateEntity(rowsService.findSlotByKey(rows, 'r1')!, { n: 5 });
        db.flush();

        expect(seen).toEqual([10]);
        expect(seen[seen.length - 1]).toBe(doubledService.getValueByKey(doubled, undefined));
        effectService.disposeEffect(node);
    });
});
