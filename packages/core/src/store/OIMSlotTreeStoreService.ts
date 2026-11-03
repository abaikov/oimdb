import type { IOIMSlotStoreService } from './interfaces/IOIMSlotStoreService';
import type { IOIMKeyTreeWalk } from '../key/interfaces/IOIMKeyTreeWalk';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import type { TOIMSlotStoreTree } from './types/TOIMSlotStoreTree';
import { isOIMSameKeySequence } from '../key/utils/isOIMSameKeySequence';

export class OIMSlotTreeStoreService<
    TCompositeKeyPart, TSlot extends TOIMKeyedSlot<readonly TCompositeKeyPart[]>,
>
implements IOIMSlotStoreService<readonly TCompositeKeyPart[], TSlot, TOIMSlotStoreTree<TSlot, TCompositeKeyPart>> {
    public constructor(private readonly keyTreeWalk: IOIMKeyTreeWalk<TCompositeKeyPart>) {}

    public createStore(): TOIMSlotStoreTree<TSlot, TCompositeKeyPart> {
        return { rootCompositeKeyNode: { childNodes: undefined, atThisKey: undefined }, slots: new Set<TSlot>() };
    }

    public ownKey<TOwnedKey extends readonly TCompositeKeyPart[]>(compositeKey: TOwnedKey): TOwnedKey {
        return compositeKey.slice() as readonly TCompositeKeyPart[] as TOwnedKey;
    }

    public isSameKey(compositeKey: readonly TCompositeKeyPart[], otherCompositeKey: readonly TCompositeKeyPart[]): boolean {
        return isOIMSameKeySequence(compositeKey, otherCompositeKey);
    }

    public get(
        slotStoreTree: TOIMSlotStoreTree<TSlot, TCompositeKeyPart>, compositeKey: readonly TCompositeKeyPart[],
    ): TSlot | undefined {
        return this.keyTreeWalk.nodeAt(slotStoreTree.rootCompositeKeyNode, compositeKey)?.atThisKey;
    }

    public set(slotStoreTree: TOIMSlotStoreTree<TSlot, TCompositeKeyPart>, slot: TSlot): void {
        const compositeKeyNode = this.keyTreeWalk.mintNodeAt(slotStoreTree.rootCompositeKeyNode, slot.key);
        const filedSlot = compositeKeyNode.atThisKey;
        if (filedSlot !== undefined && filedSlot !== slot) slotStoreTree.slots.delete(filedSlot);
        compositeKeyNode.atThisKey = slot;
        slotStoreTree.slots.add(slot);
    }

    public delete(slotStoreTree: TOIMSlotStoreTree<TSlot, TCompositeKeyPart>, slot: TSlot): void {
        const filedSlot = this.keyTreeWalk.deleteKey(slotStoreTree.rootCompositeKeyNode, slot.key);
        if (filedSlot !== undefined) slotStoreTree.slots.delete(filedSlot);
    }

    public getSlots(slotStoreTree: TOIMSlotStoreTree<TSlot, TCompositeKeyPart>): IterableIterator<TSlot> {
        return slotStoreTree.slots.values();
    }

    public getSlotCount(slotStoreTree: TOIMSlotStoreTree<TSlot, TCompositeKeyPart>): number { return slotStoreTree.slots.size; }
}
