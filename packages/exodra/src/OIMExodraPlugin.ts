import { destroyExoNode, disconnectExoNode } from '@exodra/core';
import type { IOIMSlotReleaseListener, OIMDB, TOIMDisposer, TOIMSlot } from '@oimdb/core';
import type { TOIMExodraNode } from './types/TOIMExodraNode';
import type { TOIMExodraParkedNode } from './types/TOIMExodraParkedNode';
import type { TOIMExodraPluginOptions } from './types/TOIMExodraPluginOptions';

export class OIMExodraPlugin implements IOIMSlotReleaseListener {
    public readonly db: OIMDB;

    public readonly slotDataCell: number;

    private readonly releaseListenerDisposer: TOIMDisposer;

    public constructor(options: TOIMExodraPluginOptions) {
        this.db = options.db;
        this.slotDataCell = options.db.claimSlotDataCell();
        this.releaseListenerDisposer = options.db.addSlotReleaseListener(this);
    }

    public parkNode(parkedSlots: Set<TOIMSlot>, slot: TOIMSlot, node: TOIMExodraNode): void {
        const data = (slot.data ??= []);
        const parkedNode = data[this.slotDataCell] as TOIMExodraParkedNode | undefined;
        if (parkedNode !== undefined) {
            destroyExoNode(node);
            return;
        }
        data[this.slotDataCell] = { parkedSlots, node } satisfies TOIMExodraParkedNode;
        parkedSlots.add(slot);
        disconnectExoNode(node);
    }

    public unparkNode(parkedSlots: Set<TOIMSlot> | undefined, slot: TOIMSlot): TOIMExodraNode | undefined {
        const data = slot.data;
        const parkedNode = data?.[this.slotDataCell] as TOIMExodraParkedNode | undefined;
        if (data === undefined || parkedNode === undefined) return undefined;
        if (parkedSlots !== undefined && parkedNode.parkedSlots !== parkedSlots) return undefined;
        data[this.slotDataCell] = undefined;
        parkedNode.parkedSlots.delete(slot);
        return parkedNode.node;
    }

    public destroyParkedNode(parkedSlots: Set<TOIMSlot> | undefined, slot: TOIMSlot): void {
        const parkedNode = this.unparkNode(parkedSlots, slot);
        if (parkedNode !== undefined) destroyExoNode(parkedNode);
    }

    public onSlotReleased(slot: TOIMSlot): void {
        this.destroyParkedNode(undefined, slot);
    }

    public dispose(): void {
        this.releaseListenerDisposer();
    }
}
