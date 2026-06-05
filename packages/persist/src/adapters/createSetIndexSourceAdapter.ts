import { TOIMPk } from '@oimdb/core';
import { TOIMIndexPersistSnapshot } from '../types/TOIMIndexPersistSnapshot';
import { TOIMPersistSourceAdapter } from '../types/TOIMPersistSourceAdapter';
import { TOIMSetIndexPersistSource } from '../types/TOIMSetIndexPersistSource';
import { createIndexSourceAdapter } from './createIndexSourceAdapter';
import { createSlot } from './createSlot';

export function createSetIndexSourceAdapter<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
>(
    index: TOIMSetIndexPersistSource<TKey, TPk>
): TOIMPersistSourceAdapter<TOIMIndexPersistSnapshot<TKey, TPk>> {
    return createIndexSourceAdapter<TKey, TPk>(index, (key, pks) => {
        index.setSlots(key, new Set(pks.map(createSlot)));
    });
}
