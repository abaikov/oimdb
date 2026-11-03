import type { IOIMSlotOwner } from './interfaces/IOIMSlotOwner';
import type { TOIMEffect } from '../effect/types/TOIMEffect';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMEditable } from './types/TOIMEditable';
import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { IOIMSlotSubscriptionListener } from './interfaces/IOIMSlotSubscriptionListener';
import { OIMNoSlotSubscriptionListener } from './OIMNoSlotSubscriptionListener';
import { assertOIMSlotNotReleased } from './utils/assertOIMSlotNotReleased';
import { OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS } from './constants/OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS';
export abstract class OIMSlotOwner implements IOIMSlotOwner {
    private readonly slotSubscriptionListener: IOIMSlotSubscriptionListener;

    public constructor(slotSubscriptionListener?: IOIMSlotSubscriptionListener) {
        this.slotSubscriptionListener = slotSubscriptionListener ?? OIMNoSlotSubscriptionListener.INSTANCE;
    }

    public holdSlot(slot: TOIMSlot): void {
        this.assertNotReleased(slot);
        (slot as TOIMEditable<TOIMSlot>).holdCount++;
    }

    public unholdSlot(slot: TOIMSlot): void {
        if (slot.holdCount === 0) {
            this.assertNotReleased(slot);
            throw new Error(
                'OIMSlotOwner.unholdSlot: this slot is not held, so there is no hold to give back. '
                + 'Every unholdSlot answers one holdSlot; a second one against the same hold would take a '
                + 'reference somebody else is still standing on and release a slot they are reading.',
            );
        }
        (slot as TOIMEditable<TOIMSlot>).holdCount--;
        if (slot.holdCount !== 0) return;
        this.onSlotUnheld(slot);
    }

    public subscribeToSlot(slot: TOIMSlot, effect: TOIMEffect, edge: number, columnGroup?: TOIMColumnGroup): number {
        this.holdSlot(slot);
        const editableSlot = slot as TOIMEditable<TOIMSlot>;
        if (columnGroup !== undefined) editableSlot.slotFlags |= OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS;
        const subscribers = (editableSlot.effects ??= []);
        subscribers.push(effect);
        (editableSlot.effectEdges ??= []).push(edge);
        if (subscribers.length === 1) this.onSlotFirstSubscribed(slot);
        return subscribers.length - 1;
    }

    public unsubscribeFromSlot(slot: TOIMSlot, positionInSlot: number, effect: TOIMEffect): boolean {
        const subscribers = slot.effects;
        const effectEdges = slot.effectEdges;
        if (subscribers === undefined || effectEdges === undefined) return false;
        if (subscribers[positionInSlot] !== effect) return false;
        const last = subscribers.length - 1;
        const tailEffect = subscribers[last];
        const tailEdge = effectEdges[last];
        subscribers[positionInSlot] = tailEffect;
        effectEdges[positionInSlot] = tailEdge;
        subscribers.pop();
        effectEdges.pop();
        if (last !== positionInSlot) tailEffect.effectService.setPositionInSubscribedSlot(tailEffect, tailEdge, positionInSlot);
        if ((slot.slotFlags & OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS) !== 0 && !hasColumnFilteredSubscriber(subscribers, effectEdges)) {
            (slot as TOIMEditable<TOIMSlot>).slotFlags &= ~OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS;
        }
        if (last === 0) {
            this.onSlotLastUnsubscribed(slot);
        }
        this.unholdSlot(slot);
        return true;
    }

    public abstract releaseSlotIfUnheld(slot: TOIMSlot): void;

    public unsafeMutateSlot(slot: TOIMSlot, mutateSlot: (editableSlot: TOIMEditable<TOIMSlot>) => void): void {
        mutateSlot(slot as TOIMEditable<TOIMSlot>);
    }

    protected onSlotFirstSubscribed(slot: TOIMSlot): void {
        this.slotSubscriptionListener.onSlotFirstSubscribed(slot);
    }

    protected onSlotLastUnsubscribed(slot: TOIMSlot): void {
        this.slotSubscriptionListener.onSlotLastUnsubscribed(slot);
    }

    protected onSlotUnheld(slot: TOIMSlot): void {
        this.releaseSlotIfUnheld(slot);
    }

    protected assertNotReleased(slot: TOIMSlot): void {
        assertOIMSlotNotReleased(slot);
    }
}

function hasColumnFilteredSubscriber(subscribers: readonly TOIMEffect[], effectEdges: readonly number[]): boolean {
    for (let i = 0; i < subscribers.length; i++) {
        if (subscribers[i].columnGroupsByEdge?.[effectEdges[i]] !== undefined) return true;
    }
    return false;
}
