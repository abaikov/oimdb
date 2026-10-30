import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export type TOIMEntityContentSlot<TEntity extends object = object> = TOIMSlot & {
    readonly entity: TEntity | undefined;
    readonly data: unknown[] | undefined;
};
