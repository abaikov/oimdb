import type { TOIMSlot } from './TOIMSlot';

export type TOIMKeyedSlot<TKey extends NonNullable<unknown> = NonNullable<unknown>> = TOIMSlot & {
    readonly key: TKey;
};
