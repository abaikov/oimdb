import type { TOIMCompositeKeyNode } from '../types/TOIMCompositeKeyNode';

export interface IOIMKeyTreeWalk<TCompositeKeyPart> {
    mintNodeAt<TAtKey, TStoreCompositeKeyPart extends TCompositeKeyPart>(
        rootCompositeKeyNode: TOIMCompositeKeyNode<TAtKey, TStoreCompositeKeyPart>,
        compositeKey: readonly TStoreCompositeKeyPart[],
    ): TOIMCompositeKeyNode<TAtKey, TStoreCompositeKeyPart>;

    nodeAt<TAtKey, TStoreCompositeKeyPart extends TCompositeKeyPart>(
        rootCompositeKeyNode: TOIMCompositeKeyNode<TAtKey, TStoreCompositeKeyPart>,
        compositeKey: readonly TStoreCompositeKeyPart[],
    ): TOIMCompositeKeyNode<TAtKey, TStoreCompositeKeyPart> | undefined;

    deleteKey<TAtKey, TStoreCompositeKeyPart extends TCompositeKeyPart>(
        rootCompositeKeyNode: TOIMCompositeKeyNode<TAtKey, TStoreCompositeKeyPart>,
        compositeKey: readonly TStoreCompositeKeyPart[],
    ): TAtKey | undefined;
}
