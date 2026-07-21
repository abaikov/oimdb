import { TOIMKey } from '../../../types/TOIMKey';
import { TOIMPk } from '../../../types/TOIMPk';

export type TOIMComputedUpdatePayload<TKey extends TOIMKey> = {
    keys: readonly TKey[];
};
