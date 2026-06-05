import { TOIMPk } from '@oimdb/core';
import { TOIMIndexPersistSnapshot } from '../types/TOIMIndexPersistSnapshot';
import { TOIMOrderedArrayIndexPersistSource } from '../types/TOIMOrderedArrayIndexPersistSource';
import { TOIMPersistSourceAdapter } from '../types/TOIMPersistSourceAdapter';
import { createIndexSourceAdapter } from './createIndexSourceAdapter';
import { createSlot } from './createSlot';

export function createOrderedArrayIndexSourceAdapter<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
>(
    index: TOIMOrderedArrayIndexPersistSource<TKey, TPk>
): TOIMPersistSourceAdapter<TOIMIndexPersistSnapshot<TKey, TPk>> {
    return createIndexSourceAdapter<TKey, TPk>(index, (key, pks) => {
        if (index.reset) {
            index.reset(key, pks);
        } else if (index.resetSlots) {
            index.resetSlots(key, pks.map(createSlot));
        } else if (index.setSlots) {
            index.setSlots(key, pks.map(createSlot));
        } else {
            throw new Error(
                '[OIMPersist]: ordered array index must expose reset, resetSlots, or setSlots.'
            );
        }
    });
}
