import type { OIMDB } from '@oimdb/core';

export type TOIMExodraEffect<TNode> = (body: (c: TNode, db: OIMDB) => void) => void;
