import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMEffectService } from '../OIMEffectService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

type TRow = { id: string; n: number };

const createFixture = () => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: (row: TRow) => row.id });
    const rows = rowsService.createStoreSlot(db);
    for (let i = 0; i < 8; i++) rowsService.slotContentService.upsertEntity(rows, { id: `r${i}`, n: i });
    db.flush();
    const slots: TOIMSlot[] = [];
    for (let i = 0; i < 8; i++) slots.push(rowsService.getSlotByKey(rows, `r${i}`) as TOIMSlot);
    const computedOver = (sourceSlots: readonly TOIMSlot[], sourceComputeds: readonly TOIMComputedSlot[]): TOIMComputedSlot<number, void> => {
        const computedService = createOIMComputedService<void, number>({
            computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
            sameValueGuard: oimSameValueZeroGuard,
        });
        return computedService.computedCollectionService.getSlotByKey(
            computedService.createComputedStoreSlot(db, () => 0, () => ({ sourceSlots, sourceComputeds })), undefined,
        );
    };
    return { db, effectService, slots, computedOver };
};

const subscriberCount = (slot: TOIMSlot): number => slot.effects?.length ?? 0;

describe('what a computed keeps of its roots', () => {
    it('a chain hands every level the root array of its first level, and the effect on its head takes that array', () => {
        const { db, effectService, slots, computedOver } = createFixture();
        const first = computedOver(slots, []);
        const second = computedOver([], [first]);
        const head = computedOver([], [second]);

        const effect = effectService.createEffect(db, [], [head], () => { /* watched */ });

        expect(first.allRootSlots === slots).toBe(true);
        expect(second.allRootSlots === slots).toBe(true);
        expect(head.allRootSlots === slots).toBe(true);
        expect(effect.allRootSlots === slots).toBe(true);
        for (const slot of slots) expect(subscriberCount(slot)).toBe(1);
        effectService.disposeEffect(effect);
        for (const slot of slots) expect(subscriberCount(slot)).toBe(0);
    });

    it('a root two branches share is subscribed once per branch, wakes the effect once, and leaves nothing behind', () => {
        const { db, effectService, slots, computedOver } = createFixture();
        const left = computedOver([slots[0], slots[1]], []);
        const right = computedOver([slots[1], slots[2]], []);
        let runs = 0;
        const effect = effectService.createEffect(db, [], [left, right], () => { runs++; });
        db.flush();
        const runsAfterMount = runs;

        expect(subscriberCount(slots[1])).toBe(2);
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, slots[1]);
        db.flush();
        expect(runs).toBe(runsAfterMount + 1);

        effectService.disposeEffect(effect);
        expect(subscriberCount(slots[0])).toBe(0);
        expect(subscriberCount(slots[1])).toBe(0);
        expect(subscriberCount(slots[2])).toBe(0);
    });

    it('another effect on the same slot keeps its own position when one of two duplicate edges leaves', () => {
        const { db, effectService, slots } = createFixture();
        let otherRuns = 0;
        const twice = effectService.createEffect(db, [slots[0], slots[0]], [], () => { /* watched */ });
        const other = effectService.createEffect(db, [slots[0]], [], () => { otherRuns++; });
        db.flush();
        const otherRunsAfterMount = otherRuns;

        effectService.disposeEffect(twice);
        expect(subscriberCount(slots[0])).toBe(1);
        expect(slots[0].effects?.[0] === other).toBe(true);

        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, slots[0]);
        db.flush();
        expect(otherRuns).toBe(otherRunsAfterMount + 1);
        effectService.disposeEffect(other);
        expect(subscriberCount(slots[0])).toBe(0);
    });
});
