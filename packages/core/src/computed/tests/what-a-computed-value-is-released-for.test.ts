import { OIMDB } from '../../db/OIMDB';
import { createOIMComputedService } from '../createOIMComputedService';
import { createOIMSingleComputedService } from '../createOIMSingleComputedService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import type { OIMComputedSlot } from '../OIMComputedSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type TCorrection = { id: string; version: number; note: string };
type TQuery = { key: string; version: number };

function setUp(sameValueGuard?: (prev: TQuery, next: TQuery) => boolean) {
    const db = new OIMDB();
    const correctionsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCorrection>() });
    const corrections = correctionsService.createStoreSlot(db);
    const released: TQuery[] = [];
    let derived = 0;
    const queriesService = createOIMComputedService<string, TQuery>({
        createSources: slot => ({ sourceSlots: [correctionsService.getSlotByKey(corrections, slot.key)] }),
        derive: slot => {
            derived++;
            return { key: slot.key, version: correctionsService.findSlotByKey(corrections, slot.key)?.entity?.version ?? 0 };
        },
        sameValueGuard,
        releaseValue: query => { released.push(query); },
        initialValue: { key: '', version: -1 },
    });
    const queries = queriesService.createComputedStoreSlot(db);
    const correct = (key: string, version: number, note = '') => {
        correctionsService.writeSlotContentByKey(corrections, key, { id: key, version, note });
        db.flush();
    };
    return { db, queriesService, queries, correct, released, derivedCount: () => derived };
}

describe('what a computed value is released for', () => {
    it('releases the previous value when derive produced a different one, and never the initial value', () => {
        const { queriesService, queries, correct, released } = setUp();
        const query = queriesService.computedCollectionService.holdSlotByKey(queries, 'q');
        const first = readValueWithoutTracking(query);
        expect(released).toEqual([]);

        correct('q', 1);
        const second = readValueWithoutTracking(query);

        expect(second).not.toBe(first);
        expect(released).toEqual([first]);
        expect(released[0]).toBe(first);
    });

    it('releases nothing when derive answers with the value the slot already holds', () => {
        const { queriesService, queries, correct, released, derivedCount } = setUp((prev, next) => prev.version === next.version);
        const query = queriesService.computedCollectionService.holdSlotByKey(queries, 'q');
        correct('q', 1);
        const kept = readValueWithoutTracking(query);
        const derivedBefore = derivedCount();

        correct('q', 1, 'touched');
        expect(readValueWithoutTracking(query)).toBe(kept);

        expect(derivedCount()).toBe(derivedBefore + 1);
        expect(released).not.toContain(kept);
    });

    it('releases a new object the guard called equal, since it is dropped and the slot keeps the old one', () => {
        const { queriesService, queries, correct, released } = setUp((prev, next) => prev.version === next.version);
        const query = queriesService.computedCollectionService.holdSlotByKey(queries, 'q');
        correct('q', 1);
        const kept = readValueWithoutTracking(query);
        released.length = 0;

        correct('q', 1, 'touched');
        readValueWithoutTracking(query);

        expect(released).toHaveLength(1);
        expect(released[0]).not.toBe(kept);
        expect(released[0]).toEqual(kept);
    });

    it('releases the current value when the slot is released', () => {
        const { queriesService, queries, released } = setUp();
        const query = queriesService.computedCollectionService.holdSlotByKey(queries, 'q');
        const current = readValueWithoutTracking(query);

        query.owner.unholdSlot(query);

        expect(released).toEqual([current]);
        expect(queriesService.computedCollectionService.findSlotByKey(queries, 'q')).toBeUndefined();
    });

    it('releases nothing on the release of a slot that never derived', () => {
        const { queriesService, queries, released } = setUp();
        const query = queriesService.computedCollectionService.holdSlotByKey(queries, 'q');

        query.owner.unholdSlot(query);

        expect(released).toEqual([]);
    });

    it('releases the value a derive produced after its slot was released, and stores nothing', () => {
        const db = new OIMDB();
        const released: number[] = [];
        let unholdDuringDerive: (() => void) | undefined;
        const countService = createOIMSingleComputedService<number>({
            createSources: () => ({}),
            derive: () => { unholdDuringDerive?.(); return 7; },
            releaseValue: value => { released.push(value); },
            initialValue: 0,
        });
        const count = countService.createComputedStoreSlot(db);
        const slot = countService.computedSingleSlotService.holdSingleSlot(count);
        unholdDuringDerive = () => { unholdDuringDerive = undefined; slot.owner.unholdSlot(slot); };

        expect(() => readValueWithoutTracking(slot)).not.toThrow();

        expect(released).toEqual([7]);
        expect((slot as unknown as OIMComputedSlot<number, NonNullable<unknown>, OIMSourceTracker | undefined>).content).toBe(0);
    });

    it('releases on the release an effect causes when it lets the last hold go', () => {
        const { db, queriesService, queries, released } = setUp();
        const query = queriesService.computedCollectionService.holdSlotByKey(queries, 'q');
        const watching = OIMEffectService.INSTANCE.createEffect(db, () => undefined, [], [query]);
        query.owner.unholdSlot(query);
        const current = readValueWithoutTracking(query);
        expect(released).toEqual([]);

        OIMEffectService.INSTANCE.disposeEffect(watching);

        expect(released).toEqual([current]);
    });
});
