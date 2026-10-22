import type { TOIMKeyedSlot } from './TOIMKeyedSlot';
export type TOIMIndexableSlot<TKey = unknown> = TOIMKeyedSlot<TKey> & {
    readonly indexKeys: unknown[] | undefined;
};
