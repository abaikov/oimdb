import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../OIMEffectService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import type { TOIMSingleSlotStore } from '../../store/types/TOIMSingleSlotStore';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMComputedStoreSlot } from '../types/TOIMComputedStoreSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

type TRow = { id: string; n: number };
type TSingleComputedStore = TOIMSingleSlotStore<TOIMComputedSlot<number, void>>;
type TSingleComputedService = ReturnType<typeof createOIMComputedService<void, number, TSingleComputedStore>>;
type TSingleComputedStoreSlot = TOIMComputedStoreSlot<TSingleComputedStore, number, void>;

const createSingleComputedService = (): TSingleComputedService => createOIMComputedService<void, number, TSingleComputedStore>({
    computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
    sameValueGuard: oimSameValueZeroGuard,
});

const readsOf = (service: TSingleComputedService) => ({
    getSlotByKey: (storeSlot: TSingleComputedStoreSlot, key: undefined) => service.computedCollectionService.getSlotByKey(storeSlot, key),
    getValueByKey: (storeSlot: TSingleComputedStoreSlot, key: undefined) => {
        const computedSlot = service.computedCollectionService.getSlotByKey(storeSlot, key);
        return computedSlot.computedValueService.getValueForSlot(computedSlot);
    },
});

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: (row) => row.id });
    const rows = rowsService.createStoreSlot(db);
    rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 0 });
    db.flush();
    const updateRow = (key: string, patch: Partial<TRow>): void => {
        const rowSlot = rowsService.findSlotByKey(rows, key);
        if (rowSlot !== undefined) rowsService.slotContentService.updateEntity(rowSlot, patch);
    };
    return { db, effectService, updateRow, slot: rowsService.getSlotByKey(rows, 'r1') };
};

/**
 * A chain of `depth` derivations over `source`, each reading the one below it,
 * so the deepest is `depth` levels up.
 *
 * A counter in the value, so `held` never swallows a recomputation: a
 * derivation that recomputed to the same value moves no stamp, and a chain of
 * those would not reach its own top.
 */
const chainOver = (
    source: TOIMSlot,
    depth: number,
    onRecompute: (level: number) => void,
    db: OIMDB,
): { deepestService: ReturnType<typeof readsOf>; deepest: TSingleComputedStoreSlot } => {
    const services: TSingleComputedService[] = [];
    const nodes: TSingleComputedStoreSlot[] = [];
    for (let level = 1; level <= depth; level++) {
        const at = level;
        let ran = 0;
        const body = (): number => { ran++; onRecompute(at); return ran; };
        const belowService = services[services.length - 1];
        const below = nodes[nodes.length - 1];
        const service = createSingleComputedService();
        services.push(service);
        nodes.push(service.createComputedStoreSlot(
            db,
            body,
            () => below === undefined
                ? { sourceSlots: [source] }
                : { sourceComputeds: [belowService.computedCollectionService.getSlotByKey(below, undefined)] },
        ));
    }
    if (nodes.length === 0) throw new Error('chainOver: depth must be at least 1');
    return { deepestService: readsOf(services[services.length - 1]), deepest: nodes[nodes.length - 1] };
};

describe('a body runs on a settled graph and never on a half-built one', () => {
    /**
     * The chain is built and settled in an earlier frame, so at the moment the
     * write below lands NOT ONE of its nodes owes anything. A scheduler that
     * learned its `topLevel` from `schedule` would still have been at 1 when the
     * slot's delivery node was queued, and would have told the consumer first.
     *
     * The body records what the chain had done BY THE TIME IT RAN, which is the
     * observation that separates the two orders. `toBe(depth)` and not
     * `toBeGreaterThan(0)`: "some of the graph ran" is exactly the half-built
     * frame this is about.
     */
    it('runs a body over a root and a chain only after the whole chain recomputed', () => {
        const { db, effectService, updateRow, slot } = createFixture();
        const depth = 4;
        const recomputed: number[] = [];
        const { deepestService, deepest } = chainOver(slot, depth,(level) => { recomputed.push(level); }, db);

        let chainDepthAtBody = -1;
        let ran = 0;
        effectService.createEffect(db, [slot], [deepestService.getSlotByKey(deepest, undefined)], () => {
            ran++;
            chainDepthAtBody = recomputed.length;
        });
        // The first write settles the chain for the first time; the frame under
        // test is the second one.
        updateRow('r1', { n: 1 });
        db.flush();
        recomputed.length = 0;
        ran = 0;
        chainDepthAtBody = -1;

        updateRow('r1', { n: 2 });
        db.flush();

        expect(ran).toBe(1);
        expect(recomputed).toEqual([1, 2, 3, 4]);
        // The whole chain, not part of it — and taken from inside the body, so
        // it is what the consumer could actually see.
        expect(chainDepthAtBody).toBe(depth);
    });

    /**
     * AND FOR A CONSUMER THAT READS ONLY THE DERIVED VALUE, which is the
     * ordinary React binding: a view over a derivation. It must run once, after
     * the value settled, and never once per link in the chain.
     */
    it('runs a body over a derived value once, after it settled', () => {
        const { db, effectService, updateRow, slot } = createFixture();
        const recomputed: number[] = [];
        const { deepestService, deepest } = chainOver(slot, 3,(level) => { recomputed.push(level); }, db);

        let woken = 0;
        let seenAtWake = -1;
        effectService.createEffect(db, [], [deepestService.getSlotByKey(deepest, undefined)], () => { woken++; seenAtWake = deepestService.getValueByKey(deepest, undefined); });
        updateRow('r1', { n: 1 });
        db.flush();
        recomputed.length = 0;
        woken = 0;

        updateRow('r1', { n: 2 });
        db.flush();

        expect(woken).toBe(1);
        expect(recomputed).toEqual([1, 2, 3]);
        // The value the body read is the one this frame produced, not the one
        // the frame started with.
        expect(seenAtWake).toBe(deepestService.getValueByKey(deepest, undefined));
    });

    it('stops settling a chain nothing reads, and still settles the one built after it', () => {
        const { db, effectService, updateRow, slot } = createFixture();
        const recomputed: number[] = [];
        const { deepestService, deepest } = chainOver(slot, 5,(level) => { recomputed.push(level); }, db);
        const reader = effectService.createEffect(db, [], [deepestService.getSlotByKey(deepest, undefined)], () => { /* reads the chain */ });
        updateRow('r1', { n: 1 });
        db.flush();
        // The chain's only reader lets go, so nothing asks it for a value again.
        effectService.disposeEffect(reader);
        recomputed.length = 0;

        let shallowRan = 0;
        /**
         * THE COUNTER THAT IS THE VALUE, AND IT IS NOT THE ONE RESET BELOW.
         *
         * `chainOver` says why a derivation here puts a counter in its value: a
         * settle that recomputes to the same value moves no stamp, so the
         * `held` swallows it and the effect over it is not run. Returning
         * `shallowRan` and resetting it between the two frames makes the second
         * settle produce 1 again, exactly equal to the first, so `oimSameValueZeroGuard`
         * holds the value and the body never runs — `shallowRan` reads 1 and
         * `shallowAtBody` stays at -1, the settle assertion passing and the
         * delivery assertion unable to.
         *
         * Two counters, because they are two facts. This one only ever rises, so
         * every settle is a change; `shallowRan` counts settles and is reset, so
         * the assertions below speak about the last frame alone.
         */
        let shallowValue = 0;
        const shallowComputedService = createSingleComputedService();
        const shallowService = readsOf(shallowComputedService);
        const shallow = shallowComputedService.createComputedStoreSlot(
            db,
            () => { shallowRan++; shallowValue++; return shallowValue; },
            () => ({ sourceSlots: [slot] }),
        );
        let shallowAtBody = -1;
        effectService.createEffect(db, [], [shallowService.getSlotByKey(shallow, undefined)], () => { shallowAtBody = shallowRan; });
        updateRow('r1', { n: 2 });
        db.flush();
        shallowRan = 0;
        shallowAtBody = -1;

        updateRow('r1', { n: 3 });
        db.flush();

        expect(recomputed).toEqual([]);
        expect(shallowRan).toBe(1);
        expect(shallowAtBody).toBe(1);
    });
});
