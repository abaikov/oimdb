import type { TOIMKeyedSlot } from './TOIMKeyedSlot';
export type TOIMIndexableSlot<TKey extends NonNullable<unknown> = NonNullable<unknown>> = TOIMKeyedSlot<TKey> & {
    readonly indexKeys: unknown[] | undefined;
};
