import { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';
import { OIMLogAndContinueErrorPolicy } from '../../error/OIMLogAndContinueErrorPolicy';
import { OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_IDLE } from '../constants/OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_IDLE';
import { oimGetReleaseDueAfterIdleMs } from '../../slot/utils/oimGetReleaseDueAfterIdleMs';
import { oimSetReleaseDueAfterIdleMs } from '../../slot/utils/oimSetReleaseDueAfterIdleMs';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

const slotDueAt = (dueMs: number): TOIMSlot => {
    const slot = { releaseDueAfterIdleMs: dueMs, isReleased: false };
    return Object.assign(slot, {
        owner: { releaseSlotIfUnheld: () => { slot.isReleased = true; } },
    }) as unknown as TOIMSlot;
};

const createSlotReleaseWheel = (clock: { nowMs: number }): OIMSlotReleaseWheel => new OIMSlotReleaseWheel({
    getNowMs: () => clock.nowMs,
    timer: () => () => undefined,
    errorPolicy: OIMLogAndContinueErrorPolicy.INSTANCE,
    getReleaseDueMs: oimGetReleaseDueAfterIdleMs,
    setReleaseDueMs: oimSetReleaseDueAfterIdleMs,
    releaseScheduledSlotFlag: OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_IDLE,
});

describe('what the queue answers about a slot it holds', () => {
    it('is nothing for a slot it was never handed', () => {
        const slotReleaseWheel = createSlotReleaseWheel({ nowMs: 0 });

        expect(slotReleaseWheel.isSlotReleaseScheduled(slotDueAt(5_000))).toBe(false);
    });

    it('holds a slot once it is handed one', () => {
        const slotReleaseWheel = createSlotReleaseWheel({ nowMs: 0 });
        const slot = slotDueAt(100);

        slotReleaseWheel.scheduleSlotRelease(slot, slotReleaseWheel.getNowMs());

        expect(slotReleaseWheel.isSlotReleaseScheduled(slot)).toBe(true);
    });

    it('is nothing again once the slot is taken off the queue', () => {
        const slotReleaseWheel = createSlotReleaseWheel({ nowMs: 0 });
        const slot = slotDueAt(100);
        slotReleaseWheel.scheduleSlotRelease(slot, slotReleaseWheel.getNowMs());

        slotReleaseWheel.cancelSlotRelease(slot);

        expect(slotReleaseWheel.isSlotReleaseScheduled(slot)).toBe(false);
    });
});
