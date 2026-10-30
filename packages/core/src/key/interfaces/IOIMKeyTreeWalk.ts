import type { TOIMCompositeKeyNode } from '../types/TOIMCompositeKeyNode';

export interface IOIMKeyTreeWalk<TCompositeKeyPart> {
    mintNodeAt<TAtKey>(
        rootCompositeKeyNode: TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart>,
        compositeKey: readonly TCompositeKeyPart[],
    ): TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart>;

    nodeAt<TAtKey>(
        rootCompositeKeyNode: TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart>,
        compositeKey: readonly TCompositeKeyPart[],
    ): TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart> | undefined;

    deleteKey<TAtKey>(
        rootCompositeKeyNode: TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart>,
        compositeKey: readonly TCompositeKeyPart[],
    ): TAtKey | undefined;
}
