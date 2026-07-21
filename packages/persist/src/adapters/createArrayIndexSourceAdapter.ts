import { TOIMKey } from '@oimdb/core';
import { TOIMArrayIndexPersistSource } from '../types/TOIMArrayIndexPersistSource';
import { TOIMIndexPersistSnapshot } from '../types/TOIMIndexPersistSnapshot';
import { TOIMPersistSourceAdapter } from '../types/TOIMPersistSourceAdapter';
import { createIndexSourceAdapter } from './createIndexSourceAdapter';
import { createSlot } from './createSlot';

export function createArrayIndexSourceAdapter<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
>(
    index: TOIMArrayIndexPersistSource<TKey, TPk>
): TOIMPersistSourceAdapter<TOIMIndexPersistSnapshot<TKey, TPk>> {
    return createIndexSourceAdapter<TKey, TPk>(index, (key, pks) => {
        index.setSlots(key, pks.map(createSlot));
    });
}
