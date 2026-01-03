import { TOIMPk } from '../../../type/TOIMPk';

export type TOIMComputedUpdatePayload<TKey extends TOIMPk> = {
    keys: readonly TKey[];
};
