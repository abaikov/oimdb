import { EOIMObjectEventType } from '@oimdb/core';
import { TOIMObjectPersistSnapshot } from '../types/TOIMObjectPersistSnapshot';
import { TOIMObjectPersistSource } from '../types/TOIMObjectPersistSource';
import { TOIMPersistSourceAdapter } from '../types/TOIMPersistSourceAdapter';
import { noop } from '../utils/noop';

export function createObjectSourceAdapter<TKey extends string, TValue>(
    object: TOIMObjectPersistSource<TKey, TValue>
): TOIMPersistSourceAdapter<TOIMObjectPersistSnapshot<TKey, TValue>> {
    return {
        read() {
            return object.getAll();
        },
        write(snapshot) {
            object.clear();
            object.merge(snapshot);
        },
        subscribe(onChange) {
            return object.emitter
                ? object.emitter.on(EOIMObjectEventType.UPDATE, onChange)
                : noop;
        },
    };
}
