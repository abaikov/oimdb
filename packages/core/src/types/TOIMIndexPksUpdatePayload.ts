import { TOIMKey } from './TOIMKey';
import { TOIMPk } from './TOIMPk';

export type TOIMIndexPksUpdatePayload<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> = {
    key: TKey;
    pks: readonly TPk[];
};
