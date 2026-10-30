import type { TOIMCompositeKeyNode } from '../../key/types/TOIMCompositeKeyNode';

export type TOIMSlotStoreTree<TSlot, TCompositeKeyPart> = {
    readonly rootCompositeKeyNode: TOIMCompositeKeyNode<TSlot, TCompositeKeyPart>;
    readonly slots: Set<TSlot>;
};
