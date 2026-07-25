import { EOIMCollectionEventType, TOIMKey } from '@oimdb/core';
import { TOIMCollectionPersistSnapshot } from '../types/TOIMCollectionPersistSnapshot';
import { TOIMCollectionPersistSource } from '../types/TOIMCollectionPersistSource';
import { TOIMPersistKeyedCapability } from '../types/TOIMPersistKeyedCapability';
import { TOIMPersistSourceAdapter } from '../types/TOIMPersistSourceAdapter';
import { noop } from '../utils/noop';

export function createCollectionSourceAdapter<
    TEntity extends object,
    TPk extends TOIMKey,
>(
    collection: TOIMCollectionPersistSource<TEntity, TPk>
): TOIMPersistSourceAdapter<
    TOIMCollectionPersistSnapshot<TPk, TEntity>,
    TPk,
    TEntity
> {
    // The keyed/delta capability needs three things from the source: the changed
    // PKs (subscribeOnAnyUpdate), single-PK reads (getOneByPk) and PK-level
    // removal (removeManyByPks). A reactive collection provides all three; a bare
    // source may not, in which case the adapter stays whole-snapshot only.
    // Note: these are methods that rely on `this` internally, so they must be
    // invoked through `collection`, never destructured and called bare.
    const canDelta =
        collection.getOneByPk !== undefined &&
        collection.removeManyByPks !== undefined &&
        collection.subscribeOnAnyUpdate !== undefined;

    const keyed: TOIMPersistKeyedCapability<TPk, TEntity> | undefined = canDelta
        ? {
              subscribeKeys(onChange) {
                  return collection.subscribeOnAnyUpdate!(pks => onChange(pks));
              },
              readDelta(pks) {
                  const upserts: Array<{ key: TPk; value: TEntity }> = [];
                  const deletedKeys: TPk[] = [];
                  for (let i = 0; i < pks.length; i++) {
                      const pk = pks[i];
                      const value = collection.getOneByPk!(pk);
                      if (value === undefined) deletedKeys.push(pk);
                      else upserts.push({ key: pk, value });
                  }
                  return { upserts, deletedKeys };
              },
              applyDelta(delta) {
                  if (delta.upserts.length > 0) {
                      collection.upsertMany(
                          delta.upserts.map(upsert => upsert.value)
                      );
                  }
                  if (delta.deletedKeys.length > 0) {
                      collection.removeManyByPks!(delta.deletedKeys);
                  }
              },
          }
        : undefined;

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
        keyed,
    };
}
