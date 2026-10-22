import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

export type TOIMCompositeKeyNode<TAtKey = unknown, TCompositeKeyPart = TOIMEntitySlot> = {
    childNodes: Map<TCompositeKeyPart, TOIMCompositeKeyNode<TAtKey, TCompositeKeyPart>> | undefined;
    atThisKey: TAtKey | undefined;
};
