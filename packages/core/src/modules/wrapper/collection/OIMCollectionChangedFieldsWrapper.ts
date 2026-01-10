import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { OIMCollection } from '../../../core/OIMCollection';
import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { EOIMEventQueueEventType } from '../../../enum/EOIMEventQueueEventType';
import { EOIMCollectionEventType } from '../../../enum/EOIMCollectionEventType';
import { TOIMCollectionUpdatePayload } from '../../../type/TOIMCollectionUpdatePayload';
import { TOIMPk } from '../../../type/TOIMPk';

type TOIMFieldKey<TEntity extends object> = keyof TEntity & string;

/**
 * Wrapper around `OIMCollection` that tracks "changed fields" per entity PK.
 *
 * Important: to get field-level info, you must perform writes through this wrapper.
 *
 * DX: if the underlying collection is mutated directly (bypassing this wrapper), we detect it
 * via collection update events and infer changed fields by diffing the last observed entity snapshot.
 */
export class OIMCollectionChangedFieldsWrapper<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    public readonly collection: OIMCollection<TEntity, TPk>;
    private readonly selectPk: (entity: TEntity | Partial<TEntity>) => TPk;
    private readonly unsubscribeAfterFlush: () => void;
    private readonly unsubscribeFromCollectionEmitter: () => void;
    private isInWrite = false;
    private readonly lastEntitySnapshotByPk = new Map<TPk, Partial<TEntity>>();

    /**
     * Emits updates scoped by PK. Subscribe, then read state via `getChangedFieldsByPk(...)`
     * or drain via `consumeChangedFieldsByPk(...)`.
     */
    public readonly changedPksEventEmitter: OIMUpdateEventEmitter<TPk>;

    /**
     * Emits updates scoped by field name. Subscribe, then read state via
     * `getChangedPksByField(...)` or drain via `consumeChangedPksByField(...)`.
     */
    public readonly changedFieldsEventEmitter: OIMUpdateEventEmitter<
        TOIMFieldKey<TEntity>
    >;

    private readonly changedFieldsByPk = new Map<
        TPk,
        Set<TOIMFieldKey<TEntity>>
    >();
    private readonly changedPksByField = new Map<
        TOIMFieldKey<TEntity>,
        Set<TPk>
    >();

    constructor(
        queue: OIMEventQueue,
        collection: OIMCollection<TEntity, TPk>,
        opts?: {
            /**
             * Optional PK selector for convenience APIs like `upsertOne(...)`.
             * If not provided, only `upsertOneByPk(...)` should be used.
             */
            selectPk?: (entity: TEntity | Partial<TEntity>) => TPk;
        }
    ) {
        this.collection = collection;
        this.selectPk =
            opts?.selectPk ??
            (() => {
                throw new Error(
                    `[OIMCollectionChangedFieldsWrapper]: selectPk was not provided. Use upsertOneByPk(...) or pass opts.selectPk.`
                );
            });

        this.changedPksEventEmitter = new OIMUpdateEventEmitter<TPk>(
            queue,
            'after_flush'
        );

        this.changedFieldsEventEmitter = new OIMUpdateEventEmitter<
            TOIMFieldKey<TEntity>
        >(queue, 'after_flush');

        // Flush-scoped buffers: consumers are expected to read within the same queue.flush().
        // We clear buffered diffs at the end of each flush to avoid unbounded growth.
        this.unsubscribeAfterFlush = queue.emitter.on(
            EOIMEventQueueEventType.AFTER_FLUSH,
            this.onAfterFlush
        );

        // Detect writes that bypass the wrapper so users get correct behavior without having to
        // remember "always write through the wrapper".
        const maybeReactive = collection as unknown as {
            subscribeOnAnyUpdate?: (
                handler: (pks: readonly TPk[]) => void
            ) => () => void;
        };

        this.unsubscribeFromCollectionEmitter =
            maybeReactive.subscribeOnAnyUpdate
                ? maybeReactive.subscribeOnAnyUpdate(pks => {
                      this.onCollectionUpdate({
                          pks,
                      } as TOIMCollectionUpdatePayload<TPk>);
                  })
                : collection.emitter.on(
                      EOIMCollectionEventType.UPDATE,
                      this.onCollectionUpdate
                  );
    }

    public upsertOneByPk(pk: TPk, patch: Partial<TEntity>): void {
        this.withWrite(() => {
            this.trackPatch(pk, patch);
            this.collection.upsertOneByPk(pk, patch);
        });
        this.updateEntitySnapshot(pk);
    }

    public upsertOne(entity: TEntity | Partial<TEntity>): void {
        // We can't reliably infer changed fields from a full entity without previous state.
        // However, for typical usage where `entity` is Partial, `trackPatch` is accurate.
        this.withWrite(() => {
            const pk = this.selectPk(entity);
            this.trackPatch(pk, entity as Partial<TEntity>);
            this.collection.upsertOne(entity);
        });
        this.updateEntitySnapshot(this.selectPk(entity));
    }

    public upsertMany(entities: (TEntity | Partial<TEntity>)[]): void {
        const pks: TPk[] = [];
        this.withWrite(() => {
            for (const entity of entities) {
                const pk = this.selectPk(entity);
                pks.push(pk);
                this.trackPatch(pk, entity as Partial<TEntity>);
            }
            this.collection.upsertMany(entities);
        });
        for (let i = 0; i < pks.length; i++) this.updateEntitySnapshot(pks[i]);
    }

    public getChangedFieldsByPk(pk: TPk): ReadonlySet<TOIMFieldKey<TEntity>> {
        return this.changedFieldsByPk.get(pk) ?? new Set();
    }

    public consumeChangedFieldsByPk(pk: TPk): Set<TOIMFieldKey<TEntity>> {
        const existing = this.changedFieldsByPk.get(pk);
        if (!existing) return new Set();
        return new Set(existing);
    }

    public getChangedPksByField(
        field: TOIMFieldKey<TEntity>
    ): ReadonlySet<TPk> {
        return this.changedPksByField.get(field) ?? new Set();
    }

    public consumeChangedPksByField(field: TOIMFieldKey<TEntity>): Set<TPk> {
        const existing = this.changedPksByField.get(field);
        if (!existing) return new Set();
        return new Set(existing);
    }

    public clear(): void {
        this.changedFieldsByPk.clear();
        this.changedPksByField.clear();
    }

    public destroy(): void {
        this.changedPksEventEmitter.destroy();
        this.changedFieldsEventEmitter.destroy();
        this.unsubscribeAfterFlush();
        this.unsubscribeFromCollectionEmitter();
        this.clear();
    }

    private readonly onAfterFlush = () => {
        this.clear();
    };

    private readonly onCollectionUpdate = (
        payload: TOIMCollectionUpdatePayload<TPk>
    ) => {
        if (this.isInWrite) return;
        if (payload.pks.length === 0) return;

        for (let i = 0; i < payload.pks.length; i++) {
            const pk = payload.pks[i];
            this.trackExternalMutationByPk(pk);
        }
    };

    private withWrite(fn: () => void): void {
        if (this.isInWrite) {
            fn();
            return;
        }
        this.isInWrite = true;
        try {
            fn();
        } finally {
            this.isInWrite = false;
        }
    }

    private trackExternalMutationByPk(pk: TPk): void {
        const prev = this.lastEntitySnapshotByPk.get(pk);
        const next = this.collection.getOneByPk(pk);

        const changedKeys = this.diffChangedKeys(prev, next);
        this.updateEntitySnapshot(pk);

        if (changedKeys.length > 0) {
            this.trackChangedKeys(pk, changedKeys);
        } else {
            // Still notify by PK so consumers can re-read entity state if needed.
            this.changedPksEventEmitter.markUpdatedKeys([pk]);
        }
    }

    private diffChangedKeys(
        prev: Partial<TEntity> | undefined,
        next: TEntity | undefined
    ): TOIMFieldKey<TEntity>[] {
        if (!prev && !next) return [];
        if (!prev && next) return Object.keys(next) as TOIMFieldKey<TEntity>[];
        if (prev && !next) return Object.keys(prev) as TOIMFieldKey<TEntity>[];

        const prevObj = prev as Record<string, unknown>;
        const nextObj = next as unknown as Record<string, unknown>;
        const keys = new Set<string>();
        Object.keys(prevObj).forEach(k => keys.add(k));
        Object.keys(nextObj).forEach(k => keys.add(k));

        const changed: TOIMFieldKey<TEntity>[] = [];
        keys.forEach(k => {
            if (prevObj[k] !== nextObj[k])
                changed.push(k as TOIMFieldKey<TEntity>);
        });
        return changed;
    }

    private updateEntitySnapshot(pk: TPk): void {
        const entity = this.collection.getOneByPk(pk);
        if (!entity) {
            this.lastEntitySnapshotByPk.delete(pk);
            return;
        }
        // Shallow clone to make snapshot stable even if someone mutates the stored entity.
        this.lastEntitySnapshotByPk.set(pk, {
            ...(entity as Partial<TEntity>),
        });
    }

    private trackChangedKeys(
        pk: TPk,
        keys: readonly TOIMFieldKey<TEntity>[]
    ): void {
        let pkFields = this.changedFieldsByPk.get(pk);
        if (!pkFields) {
            pkFields = new Set();
            this.changedFieldsByPk.set(pk, pkFields);
        }

        for (const key of keys) {
            pkFields.add(key);

            let fieldPks = this.changedPksByField.get(key);
            if (!fieldPks) {
                fieldPks = new Set();
                this.changedPksByField.set(key, fieldPks);
            }
            fieldPks.add(pk);
        }

        this.changedPksEventEmitter.markUpdatedKeys([pk]);
        this.changedFieldsEventEmitter.markUpdatedKeys(keys);
    }

    private trackPatch(pk: TPk, patch: Partial<TEntity>): void {
        if (
            pk === undefined ||
            pk === null ||
            (pk as unknown as string) === ''
        ) {
            throw new Error(
                `[OIMCollectionChangedFieldsWrapper]: PK is required to track changes.`
            );
        }
        const keys = Object.keys(patch) as TOIMFieldKey<TEntity>[];
        if (keys.length === 0) return;

        this.trackChangedKeys(pk, keys);
    }
}
