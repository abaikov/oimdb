import { TOIMPk } from '../../../types/TOIMPk';

export type TOIMComputedUpdatePayload<TKey extends TOIMPk> = {
    keys: readonly TKey[];
};
