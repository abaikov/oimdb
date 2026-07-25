import { TOIMKey } from '../../../types/TOIMKey';

export type TOIMComputedUpdatePayload<TKey extends TOIMKey> = {
    keys: readonly TKey[];
};
