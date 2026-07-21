import { EOIMCollectionEventType, TOIMKey } from '@oimdb/core';
import { TOIMCollectionPersistSnapshot } from '../types/TOIMCollectionPersistSnapshot';
import { TOIMCollectionPersistSource } from '../types/TOIMCollectionPersistSource';
import { TOIMPersistSourceAdapter } from '../types/TOIMPersistSourceAdapter';
import { noop } from '../utils/noop';

export function createCollectionSourceAdapter<
    TEntity extends object,
    TPk extends TOIMKey,
>(
    collection: TOIMCollectionPersistSource<TEntity, TPk>
): TOIMPersistSourceAdapter<TOIMCollectionPersistSnapshot<TPk, TEntity>> {
    return {
        read() {
            return {
                records: collection.getAll().map(entity => ({
                    pk: collection.selectPk(entity),
                    value: entity,
                })),
            };
        },
        write(snapshot) {
            collection.clear();
            if (snapshot.records.length === 0) return;
            collection.upsertMany(snapshot.records.map(record => record.value));
        },
        subscribe(onChange) {
            // Prefer queue-integrated subscription (OIMReactiveCollection).
            // The reactive collection already accumulates dirty PKs internally;
            // no separate flag needed on our side.
            if (collection.subscribeOnAnyUpdate) {
                return collection.subscribeOnAnyUpdate(() => onChange());
            }
            return collection.emitter
                ? collection.emitter.on(EOIMCollectionEventType.UPDATE, onChange)
                : noop;
        },
    };
}
