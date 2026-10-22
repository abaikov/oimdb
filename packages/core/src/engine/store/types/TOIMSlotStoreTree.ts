import type { TOIMCompositeKeyNode } from '../../key/types/TOIMCompositeKeyNode';

export type TOIMSlotStoreTree<TSlot, TCompositeKeyPart> = {
    readonly root: TOIMCompositeKeyNode<TSlot, TCompositeKeyPart>;
    readonly slots: Set<TSlot>;
};
