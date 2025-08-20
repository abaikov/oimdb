import { TOIMPk } from './TOIMPk';

export type TOIMCollectionUpdatePayload<TPk extends TOIMPk> = {
    pks: readonly TPk[];
};
