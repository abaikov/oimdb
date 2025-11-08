import {
    TOIMIndexComparator,
    TOIMPk,
} from '@oimdb/core';
import { IOIMIndexStoreAsync } from '../interfaces/IOIMIndexStoreAsync';

export type TOIMIndexOptionsAsync<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    comparePks?: TOIMIndexComparator<TPk>;
    store?: IOIMIndexStoreAsync<TIndexKey, TPk>;
};

