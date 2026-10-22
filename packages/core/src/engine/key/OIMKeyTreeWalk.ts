import type { IOIMKeyTreeWalk } from './interfaces/IOIMKeyTreeWalk';
import type { TOIMCompositeKeyNode } from './types/TOIMCompositeKeyNode';

export abstract class OIMKeyTreeWalk<TCompositeKeyPart> implements IOIMKeyTreeWalk<TCompositeKeyPart> {
    protected abstract holdCompositeKeyPart(compositeKeyPart: TCompositeKeyPart): void;

    protected abstract unholdCompositeKeyPart(compositeKeyPart: TCompositeKeyPart): void;

    public mintNodeAt<TAtKey>(
        rootCompositeKeyNode: TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart>,
        compositeKey: readonly TCompositeKeyPart[],
    ): TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart> {
        if (compositeKey.length === 0) throw new Error('OIMKeyTreeWalk: an empty key is not a key.');
        let compositeKeyNode = rootCompositeKeyNode;
        let firstMintedDepth = -1;
        let parentOfFirstMintedCompositeKeyNode = rootCompositeKeyNode;
        for (let i = 0; i < compositeKey.length; i++) {
            const compositeKeyPart = compositeKey[i];
            let nextCompositeKeyNode = compositeKeyNode.childNodes?.get(compositeKeyPart);
            if (nextCompositeKeyNode === undefined) {
                try {
                    this.holdCompositeKeyPart(compositeKeyPart);
                } catch (failure) {
                    if (firstMintedDepth >= 0) {
                        parentOfFirstMintedCompositeKeyNode.childNodes?.delete(compositeKey[firstMintedDepth]);
                        for (let j = i - 1; j >= firstMintedDepth; j--) this.unholdCompositeKeyPart(compositeKey[j]);
                    }
                    throw failure;
                }
                nextCompositeKeyNode = { childNodes: undefined, atThisKey: undefined };
                (compositeKeyNode.childNodes ??= new Map()).set(compositeKeyPart, nextCompositeKeyNode);
                if (firstMintedDepth < 0) {
                    firstMintedDepth = i;
                    parentOfFirstMintedCompositeKeyNode = compositeKeyNode;
                }
            }
            compositeKeyNode = nextCompositeKeyNode;
        }
        return compositeKeyNode;
    }

    public nodeAt<TAtKey>(
        rootCompositeKeyNode: TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart>,
        compositeKey: readonly TCompositeKeyPart[],
    ): TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart> | undefined {
        let compositeKeyNode: TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart> | undefined = rootCompositeKeyNode;
        for (let i = 0; i < compositeKey.length; i++) {
            compositeKeyNode = compositeKeyNode.childNodes?.get(compositeKey[i]);
            if (compositeKeyNode === undefined) return undefined;
        }
        return compositeKeyNode;
    }

    public deleteKey<TAtKey>(
        rootCompositeKeyNode: TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart>,
        compositeKey: readonly TCompositeKeyPart[],
    ): TAtKey | undefined {
        const lastDepth = compositeKey.length - 1;
        if (lastDepth < 0) return undefined;
        let compositeKeyNode = rootCompositeKeyNode;
        let keptCompositeKeyNode = rootCompositeKeyNode;
        let firstUnlinkedDepth = 0;
        for (let i = 0; i < lastDepth; i++) {
            const nextCompositeKeyNode = compositeKeyNode.childNodes?.get(compositeKey[i]);
            if (nextCompositeKeyNode === undefined) return undefined;
            compositeKeyNode = nextCompositeKeyNode;
            if (compositeKeyNode.atThisKey !== undefined || (compositeKeyNode.childNodes?.size ?? 0) > 1) {
                keptCompositeKeyNode = compositeKeyNode;
                firstUnlinkedDepth = i + 1;
            }
        }
        const lastCompositeKeyNode = compositeKeyNode.childNodes?.get(compositeKey[lastDepth]);
        if (lastCompositeKeyNode === undefined) return undefined;
        const deletedAtKey = lastCompositeKeyNode.atThisKey;
        if (deletedAtKey === undefined) return undefined;
        lastCompositeKeyNode.atThisKey = undefined;
        if ((lastCompositeKeyNode.childNodes?.size ?? 0) > 0) return deletedAtKey;
        keptCompositeKeyNode.childNodes?.delete(compositeKey[firstUnlinkedDepth]);
        for (let i = lastDepth; i >= firstUnlinkedDepth; i--) this.unholdCompositeKeyPart(compositeKey[i]);
        return deletedAtKey;
    }
}
