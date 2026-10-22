import type { TOIMSlot } from './TOIMSlot';

export type TOIMKeyedSlot<TKey = unknown> = TOIMSlot & {
    readonly key: TKey;
};