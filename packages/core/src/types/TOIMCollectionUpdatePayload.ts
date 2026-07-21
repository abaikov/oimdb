import { TOIMKey } from './TOIMKey';

export type TOIMCollectionUpdatePayload<TPk extends TOIMKey> = {
    pks: readonly TPk[];
};
