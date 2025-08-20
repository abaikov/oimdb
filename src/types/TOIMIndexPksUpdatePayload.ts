import { TOIMPk } from './TOIMPk';

export type TOIMIndexPksUpdatePayload<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    key: TKey;
    pks: readonly TPk[];
};
