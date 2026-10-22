import { OIMReleaseSlotQueueService } from '../OIMReleaseSlotQueueService';
import { OIMReleaseSlotCollectorServiceAfterIdle } from '../OIMReleaseSlotCollectorServiceAfterIdle';
import { createOIMReleaseSlotCollectorSlot } from '../utils/createOIMReleaseSlotCollectorSlot';
import { OIMErrorPolicyLogAndContinue } from '../../error/OIMErrorPolicyLogAndContinue';
import type { TOIMReleaseSlotCollectorSlot } from '../types/TOIMReleaseSlotCollectorSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

const slotDueAt = (dueMs: number): TOIMSlot => {
    const slot = { releaseDueAfterIdleMs: dueMs, isReleased: false };
    return Object.assign(slot, {
        owner: { releaseSlotIfUnheld: () => { slot.isReleased = true; } },
    }) as unknown as TOIMSlot;
};

const createReleaseSlotCollectorSlot = (clock: { nowMs: number }): TOIMReleaseSlotCollectorSlot => createOIMReleaseSlotCollectorSlot({
    getNowMs: () => clock.nowMs,
    releaseTimer: () => () => undefined,
    errorPolicy: OIMErrorPolicyLogAndContinue.INSTANCE,
});

const scheduleSlotRelease = (releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, slot: TOIMSlot): void => {
    OIMReleaseSlotQueueService.INSTANCE.scheduleSlotRelease(
        releaseSlotCollectorSlot, OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE, slot, releaseSlotCollectorSlot.getNowMs(),
    );
};

describe('what the queue answers about a slot it holds', () => {
    it('is nothing for a slot it was never handed', () => {
        const clock = { nowMs: 0 };
        const releaseSlotCollectorSlot = createReleaseSlotCollectorSlot(clock);

        expect(OIMReleaseSlotQueueService.INSTANCE.isSlotReleaseScheduled(releaseSlotCollectorSlot, slotDueAt(5_000))).toBe(false);
    });

    it('holds a slot once it is handed one', () => {
        const clock = { nowMs: 0 };
        const releaseSlotCollectorSlot = createReleaseSlotCollectorSlot(clock);
        const slot = slotDueAt(100);

        scheduleSlotRelease(releaseSlotCollectorSlot, slot);

        expect(OIMReleaseSlotQueueService.INSTANCE.isSlotReleaseScheduled(releaseSlotCollectorSlot, slot)).toBe(true);
    });

    it('is nothing again once the slot is taken off the queue', () => {
        const clock = { nowMs: 0 };
        const releaseSlotCollectorSlot = createReleaseSlotCollectorSlot(clock);
        const slot = slotDueAt(100);
        scheduleSlotRelease(releaseSlotCollectorSlot, slot);

        OIMReleaseSlotQueueService.INSTANCE.cancelSlotRelease(releaseSlotCollectorSlot, slot);

        expect(OIMReleaseSlotQueueService.INSTANCE.isSlotReleaseScheduled(releaseSlotCollectorSlot, slot)).toBe(false);
    });
});
