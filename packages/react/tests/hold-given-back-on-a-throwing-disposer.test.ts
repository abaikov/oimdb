/**
 * THE HOLD, WHEN WHAT IT WAS TAKEN AROUND THROWS.
 *
 * `holdWhileSubscribed` exists for one reason: `OIMEffectService.disposeEffect` ends in
 * `root.owner?.unholdSlot(root)`, so tearing a subscription down gives back the
 * reference it took, and an identity nothing else holds at that instant is
 * unfiled. The hold is the reference that keeps it, and the order it is
 * written in is the whole mechanism:
 *
 *     off();
 *     release();
 *
 * Two bare statements. If `off()` throws, `release()` never runs, and what is
 * left is the opposite of everything this mechanism was written to prevent: the
 * identity is pinned at `holdCount` 1 for the life of the process, and — because
 * a held identity is one the owner always declines — never reclaimable. One per
 * mount, on a screen that mounts these hooks per row.
 *
 * A throw out of `off()` is not exotic: it is engine code — the dependent lists,
 * the column service, the owner's release — reached through a React cleanup,
 * where React logs the error and carries on. Nothing else notices.
 */
import type { TOIMDisposer, TOIMSlot, TOIMSlotEditable } from '@oimdb/core';
import { OIMDefaults } from '@oimdb/core';
import { holdWhileSubscribed } from '../src/holdWhileSubscribed';

function countingOwnerSlot(): TOIMSlot {
    const slot: TOIMSlot = {
        effects: undefined,
        changedAtRevision: 0,
        changedAtEpoch: 0,
        effectEdges: undefined,
        holdCount: 0,
        slotFlags: 1,
        releaseDueAfterWriteMs: -1,
        releaseDueAfterIdleMs: -1,
        releaseDueAfterUnholdMs: -1,
        columnSlotStore: undefined,
        storeSlot: undefined,
        owner: OIMDefaults.STANDALONE_SLOT_OWNER.getValue(),
    };
    (slot as TOIMSlotEditable<TOIMSlot>).owner = {
        holdSlot: (held: TOIMSlot): void => { (held as TOIMSlotEditable<TOIMSlot>).holdCount++; },
        unholdSlot: (held: TOIMSlot): void => { (held as TOIMSlotEditable<TOIMSlot>).holdCount--; },
        releaseSlotIfUnheld: (): void => undefined,
        subscribeToSlot: (): number => 0,
        unsubscribeFromSlot: (): boolean => true,
    };
    return slot;
}

describe('holdWhileSubscribed', () => {
    it('is already holding by the time the subscription is made', () => {
        const slot = countingOwnerSlot();
        const heldWhenSubscribing: number[] = [];
        const off = holdWhileSubscribed([slot], (): TOIMDisposer => {
            heldWhenSubscribing.push(slot.holdCount);
            return () => undefined;
        });

        expect(heldWhenSubscribing).toEqual([1]);
        off();
    });

    it('gives the hold back on an ordinary disposal', () => {
        const slot = countingOwnerSlot();
        let disposed = 0;
        const off = holdWhileSubscribed([slot], (): TOIMDisposer => () => { disposed++; });
        expect(slot.holdCount).toBe(1);

        off();

        expect(disposed).toBe(1);
        expect(slot.holdCount).toBe(0);
    });

    it('gives the hold back when the disposer throws, and lets the throw through', () => {
        const slot = countingOwnerSlot();
        const off = holdWhileSubscribed([slot], (): TOIMDisposer => () => {
            throw new Error('the engine disposer threw');
        });
        expect(slot.holdCount).toBe(1);

        // The caller still hears about it: containing the throw would be a
        // different defect, and the hold is not a reason to swallow one.
        expect(() => off()).toThrow('the engine disposer threw');

        expect(slot.holdCount).toBe(0);
    });

    it('gives every hold back when the subscribe itself throws', () => {
        // The wiring is all or nothing: a throw here leaves the caller with no
        // disposer, so anything taken before it can never be given back by hand.
        const first = countingOwnerSlot();
        const second = countingOwnerSlot();

        expect(() => holdWhileSubscribed([first, second], (): TOIMDisposer => {
            throw new Error('effect construction threw');
        })).toThrow('effect construction threw');

        expect(first.holdCount).toBe(0);
        expect(second.holdCount).toBe(0);
    });

    it('holds every identity it was given, and gives them all back', () => {
        const first = countingOwnerSlot();
        const second = countingOwnerSlot();
        const off = holdWhileSubscribed([first, second], (): TOIMDisposer => () => undefined);
        expect([first.holdCount, second.holdCount]).toEqual([1, 1]);

        off();

        expect([first.holdCount, second.holdCount]).toEqual([0, 0]);
    });
});
