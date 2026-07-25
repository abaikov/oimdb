import { TOIMKey } from './TOIMKey';

export type TOIMIndexPksUpdatePayload<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> = {
    key: TKey;
    pks: readonly TPk[];
};
