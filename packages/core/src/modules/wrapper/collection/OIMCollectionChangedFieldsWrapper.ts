import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { TOIMPk } from '../../../type/TOIMPk';
import { OIMUpdateEventCoalescerManual } from '../OIMUpdateEventCoalescerManual';

type TOIMFieldKey<TEntity extends object> = keyof TEntity & string;

/**
 * Wrapper around `OIMReactiveCollection` that tracks "changed fields" per entity PK.
 *
 * Important: to get field-level info, you must perform writes through this wrapper.
 * If you mutate the underlying collection directly, this wrapper will not be able
 * to infer which fields changed (core update payloads carry only PKs).
 */
export class OIMCollectionChangedFieldsWrapper<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    public readonly collection: OIMReactiveCollection<TEntity, TPk>;
    private readonly selectPk: (entity: TEntity | Partial<TEntity>) => TPk;

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

    private readonly changedPksCoalescer: OIMUpdateEventCoalescerManual<TPk>;
    private readonly changedFieldsCoalescer: OIMUpdateEventCoalescerManual<
        TOIMFieldKey<TEntity>
    >;

    constructor(
        queue: OIMEventQueue,
        collection: OIMReactiveCollection<TEntity, TPk>,
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

        this.changedPksCoalescer = new OIMUpdateEventCoalescerManual<TPk>();
        this.changedPksEventEmitter = new OIMUpdateEventEmitter<TPk>({
            coalescer: this.changedPksCoalescer,
            queue,
        });

        this.changedFieldsCoalescer = new OIMUpdateEventCoalescerManual<
            TOIMFieldKey<TEntity>
        >();
        this.changedFieldsEventEmitter = new OIMUpdateEventEmitter<
            TOIMFieldKey<TEntity>
        >({
            coalescer: this.changedFieldsCoalescer,
            queue,
        });
    }

    public upsertOneByPk(pk: TPk, patch: Partial<TEntity>): void {
        this.trackPatch(pk, patch);
        this.collection.upsertOneByPk(pk, patch);
    }

    public upsertOne(entity: TEntity | Partial<TEntity>): void {
        // We can't reliably infer changed fields from a full entity without previous state.
        // However, for typical usage where `entity` is Partial, `trackPatch` is accurate.
        const pk = this.selectPk(entity);
        this.trackPatch(pk, entity as Partial<TEntity>);
        this.collection.upsertOne(entity);
    }

    public upsertMany(entities: (TEntity | Partial<TEntity>)[]): void {
        for (const entity of entities) {
            const pk = this.selectPk(entity);
            this.trackPatch(pk, entity as Partial<TEntity>);
        }
        this.collection.upsertMany(entities);
    }

    public getChangedFieldsByPk(pk: TPk): ReadonlySet<TOIMFieldKey<TEntity>> {
        return this.changedFieldsByPk.get(pk) ?? new Set();
    }

    public consumeChangedFieldsByPk(pk: TPk): Set<TOIMFieldKey<TEntity>> {
        const existing = this.changedFieldsByPk.get(pk);
        if (!existing) return new Set();
        this.changedFieldsByPk.delete(pk);
        return existing;
    }

    public getChangedPksByField(
        field: TOIMFieldKey<TEntity>
    ): ReadonlySet<TPk> {
        return this.changedPksByField.get(field) ?? new Set();
    }

    public consumeChangedPksByField(field: TOIMFieldKey<TEntity>): Set<TPk> {
        const existing = this.changedPksByField.get(field);
        if (!existing) return new Set();
        this.changedPksByField.delete(field);
        return existing;
    }

    public clear(): void {
        this.changedFieldsByPk.clear();
        this.changedPksByField.clear();
    }

    public destroy(): void {
        this.changedPksEventEmitter.destroy();
        this.changedFieldsEventEmitter.destroy();
        this.changedPksCoalescer.destroy();
        this.changedFieldsCoalescer.destroy();
        this.clear();
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

        this.changedPksCoalescer.markUpdatedKeys([pk]);
        this.changedFieldsCoalescer.markUpdatedKeys(keys);
    }
}
