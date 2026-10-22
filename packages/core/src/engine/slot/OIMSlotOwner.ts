import type { IOIMSlotOwner } from './interfaces/IOIMSlotOwner';
import type { TOIMEffect } from '../computed/types/TOIMEffect';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMSlotEditable } from './types/TOIMSlotEditable';
import { oimAssertSlotNotReleased } from './utils/oimAssertSlotNotReleased';
export class OIMSlotOwner implements IOIMSlotOwner {
    public holdSlot(slot: TOIMSlot): void {
        this.assertNotReleased(slot);
        (slot as TOIMSlotEditable<TOIMSlot>).holdCount++;
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
        (slot as TOIMSlotEditable<TOIMSlot>).holdCount--;
        if (slot.holdCount !== 0) return;
        this.onSlotUnheld(slot);
        this.releaseSlotIfUnheld(slot);
    }

    public subscribeToSlot(slot: TOIMSlot, effect: TOIMEffect, edge: number): number {
        this.holdSlot(slot);
        const slotEditable = slot as TOIMSlotEditable<TOIMSlot>;
        const subscribers = (slotEditable.effects ??= []);
        subscribers.push(effect);
        (slotEditable.effectEdges ??= []).push(edge);
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
        if (last === 0) this.onSlotIdle(slot);
        this.unholdSlot(slot);
        return true;
    }

    public releaseSlotIfUnheld(_slot: TOIMSlot): void { return; }

    protected onSlotIdle(_slot: TOIMSlot): void { return; }

    protected onSlotUnheld(_slot: TOIMSlot): void { return; }

    protected assertNotReleased(slot: TOIMSlot): void {
        oimAssertSlotNotReleased(slot);
    }
}
