import type { TOIMSlot } from '@oimdb/core';
import type { TOIMExodraNode } from './TOIMExodraNode';

export type TOIMExodraParkedNode = {
    readonly parkedSlots: Set<TOIMSlot>;
    readonly node: TOIMExodraNode;
};
