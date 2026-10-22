import type { IOIMSlotStoreService } from './interfaces/IOIMSlotStoreService';
import type { IOIMKeyTreeWalk } from '../key/interfaces/IOIMKeyTreeWalk';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import type { TOIMSlotStoreTree } from './types/TOIMSlotStoreTree';
import { oimSameKeySequence } from '../key/utils/oimSameKeySequence';

export class OIMSlotStoreServiceTreeDriven<
    TCompositeKeyPart, TSlot extends TOIMKeyedSlot<readonly TCompositeKeyPart[]>,
>
implements IOIMSlotStoreService<readonly TCompositeKeyPart[], TSlot, TOIMSlotStoreTree<TSlot, TCompositeKeyPart>> {
    public constructor(private readonly keyTreeWalk: IOIMKeyTreeWalk<TCompositeKeyPart>) {}

    public createStore(): TOIMSlotStoreTree<TSlot, TCompositeKeyPart> {
        return { root: { childNodes: undefined, atThisKey: undefined }, slots: new Set<TSlot>() };
    }

    public ownKey<TOwnedKey extends readonly TCompositeKeyPart[]>(compositeKey: TOwnedKey): TOwnedKey {
        return compositeKey.slice() as readonly TCompositeKeyPart[] as TOwnedKey;
    }

    public isSameKey(compositeKey: readonly TCompositeKeyPart[], otherCompositeKey: readonly TCompositeKeyPart[]): boolean {
        return oimSameKeySequence(compositeKey, otherCompositeKey);
    }

    public get(
        slotStoreTree: TOIMSlotStoreTree<TSlot, TCompositeKeyPart>, compositeKey: readonly TCompositeKeyPart[],
    ): TSlot | undefined {
        return this.keyTreeWalk.nodeAt(slotStoreTree.root, compositeKey)?.atThisKey;
    }

    public set(
        slotStoreTree: TOIMSlotStoreTree<TSlot, TCompositeKeyPart>, compositeKey: readonly TCompositeKeyPart[], slot: TSlot,
    ): void {
        const compositeKeyNode = this.keyTreeWalk.mintNodeAt(slotStoreTree.root, compositeKey);
        const filedSlot = compositeKeyNode.atThisKey;
        if (filedSlot !== undefined && filedSlot !== slot) slotStoreTree.slots.delete(filedSlot);
        compositeKeyNode.atThisKey = slot;
        slotStoreTree.slots.add(slot);
    }

    public remove(
        slotStoreTree: TOIMSlotStoreTree<TSlot, TCompositeKeyPart>, compositeKey: readonly TCompositeKeyPart[],
    ): void {
        const slot = this.keyTreeWalk.deleteKey(slotStoreTree.root, compositeKey);
        if (slot !== undefined) slotStoreTree.slots.delete(slot);
    }

    public getSlots(slotStoreTree: TOIMSlotStoreTree<TSlot, TCompositeKeyPart>): IterableIterator<TSlot> {
        return slotStoreTree.slots.values();
    }

    public getSlotCount(slotStoreTree: TOIMSlotStoreTree<TSlot, TCompositeKeyPart>): number { return slotStoreTree.slots.size; }
}
