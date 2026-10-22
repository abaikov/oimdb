import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';

export type TOIMEntitySlot<TEntity extends object = object, TKey = unknown> = TOIMIndexableSlot<TKey> & {
    readonly entity: TEntity | undefined;
    readonly data: unknown[] | undefined;
};
