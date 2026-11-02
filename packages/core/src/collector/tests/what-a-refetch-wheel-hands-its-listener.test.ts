import { OIMDB } from '../../db/OIMDB';
import { OIMSlotRefetchWheel } from '../OIMSlotRefetchWheel';
import { OIM_SLICE_LENGTH_MS } from '../constants/OIM_SLICE_LENGTH_MS';
import { OIM_SLOT_FLAG_RELEASED } from '../../slot/constants/OIM_SLOT_FLAG_RELEASED';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

const START = 100 * OIM_SLICE_LENGTH_MS;

const watchedSlot = (): TOIMSlot => ({ effects: [{}], slotFlags: 0 }) as unknown as TOIMSlot;

const unwatchedSlot = (): TOIMSlot => ({ effects: undefined, slotFlags: 0 }) as unknown as TOIMSlot;

const createFixture = () => {
    let nowMs = START;
    const batches: TOIMSlot[][] = [];
    let handedArray: readonly TOIMSlot[] | undefined;
    const db = new OIMDB({ getNowMs: () => nowMs, releaseTimer: () => () => undefined });
    const refetchWheel = new OIMSlotRefetchWheel(db, {
        slotRefetchListener: {
            onSlotsRefetchDue: slots => {
                handedArray = slots;
                batches.push([...slots]);
            },
        },
    });
    return {
        refetchWheel,
        batches,
        handedArray: (): readonly TOIMSlot[] | undefined => handedArray,
        at: (value: number): void => { nowMs = value; },
    };
};

describe('what a refetch wheel hands its listener', () => {
    it('hands every watched slot that came due in one call per sweep', () => {
        const fixture = createFixture();
        const first = watchedSlot();
        const second = watchedSlot();
        fixture.refetchWheel.scheduleSlotRefetchAt(first, START + 10);
        fixture.refetchWheel.scheduleSlotRefetchAt(second, START + 3 * OIM_SLICE_LENGTH_MS);

        fixture.at(START + 5 * OIM_SLICE_LENGTH_MS);
        fixture.refetchWheel.flush();

        expect(fixture.batches).toEqual([[first, second]]);
    });

    it('never hands a slot before its moment: only slices that have fully passed are swept', () => {
        const fixture = createFixture();
        const slot = watchedSlot();
        fixture.refetchWheel.scheduleSlotRefetchAt(slot, START + OIM_SLICE_LENGTH_MS - 1);

        fixture.at(START + 10);
        fixture.refetchWheel.flush();
        expect(fixture.batches).toEqual([]);

        fixture.at(START + OIM_SLICE_LENGTH_MS);
        fixture.refetchWheel.flush();
        expect(fixture.batches).toEqual([[slot]]);
    });

    it('drops a slot nobody subscribes to, and a released one, without calling the listener for them', () => {
        const fixture = createFixture();
        const released = watchedSlot();
        (released as { slotFlags: number }).slotFlags = OIM_SLOT_FLAG_RELEASED;
        fixture.refetchWheel.scheduleSlotRefetchAt(unwatchedSlot(), START);
        fixture.refetchWheel.scheduleSlotRefetchAt(released, START);

        fixture.at(START + 2 * OIM_SLICE_LENGTH_MS);
        fixture.refetchWheel.flush();

        expect(fixture.batches).toEqual([]);
        expect(fixture.refetchWheel.getNextSliceNumber()).toBeUndefined();
    });

    it('moves a refetch earlier by filing it again, and the earlier entry comes first', () => {
        const fixture = createFixture();
        const slot = watchedSlot();
        fixture.refetchWheel.scheduleSlotRefetchAt(slot, START + 60 * OIM_SLICE_LENGTH_MS);
        fixture.refetchWheel.scheduleSlotRefetchAt(slot, START + OIM_SLICE_LENGTH_MS);

        fixture.at(START + 2 * OIM_SLICE_LENGTH_MS);
        fixture.refetchWheel.flush();

        expect(fixture.batches).toEqual([[slot]]);
        expect(fixture.refetchWheel.getNextSliceNumber()).toBe(160);
    });

    it('empties the array it handed once the listener returns', () => {
        const fixture = createFixture();
        fixture.refetchWheel.scheduleSlotRefetchAt(watchedSlot(), START);

        fixture.at(START + 2 * OIM_SLICE_LENGTH_MS);
        fixture.refetchWheel.flush();

        expect(fixture.batches).toHaveLength(1);
        expect(fixture.handedArray()).toHaveLength(0);
    });
});
