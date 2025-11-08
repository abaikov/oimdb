import {
    TOIMCollectionUpdatePayload,
    EOIMCollectionEventType,
    OIMEventEmitter,
    TOIMPkSelector,
    TOIMPk,
    OIMPkSelectorFactory,
    TOIMEntityUpdater,
    OIMEntityUpdaterFactory,
} from '@oimdb/core';
import { IOIMCollectionStoreAsync } from '../interfaces/IOIMCollectionStoreAsync';
import { TOIMCollectionOptionsAsync } from '../types/TOIMCollectionOptionsAsync';

/**
 * Async collection that works with asynchronous stores.
 * All methods return Promises and operations go directly to the async store.
 */
export class OIMCollectionAsync<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMCollectionEventType.UPDATE]: TOIMCollectionUpdatePayload<TPk>;
    }>();
    protected readonly selectPk: TOIMPkSelector<TEntity, TPk>;
    protected readonly store: IOIMCollectionStoreAsync<TEntity, TPk>;
    protected readonly updateEntity: TOIMEntityUpdater<TEntity>;

    constructor(opts: TOIMCollectionOptionsAsync<TEntity, TPk>) {
        this.selectPk = (opts?.selectPk ??
            new OIMPkSelectorFactory<
                TEntity & { id: TPk },
                TPk
            >().createIdSelector()) as TOIMPkSelector<TEntity, TPk>;
        this.store = opts.store;
        this.updateEntity =
            opts?.updateEntity ??
            new OIMEntityUpdaterFactory<TEntity>().createMergeEntityUpdater();
    }

    async getOneByPk(pk: TPk): Promise<TEntity | undefined> {
        return await this.store.getOneByPk(pk);
    }

    async getManyByPks(pks: readonly TPk[]): Promise<TEntity[]> {
        return await this.store.getManyByPks(pks);
    }

    async upsertOne(entity: TEntity): Promise<void> {
        const pk = await this.upsertOneWithoutNotifications(entity);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
    }

    async upsertMany(entities: TEntity[]): Promise<void> {
        const pks = await Promise.all(
            entities.map(entity => this.upsertOneWithoutNotifications(entity))
        );
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks });
    }

    async removeOne(entity: TEntity): Promise<void> {
        const pk = this.selectPk(entity);
        await this.store.removeOneByPk(pk);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
    }

    async removeMany(entities: TEntity[]): Promise<void> {
        const pks = entities.map(this.selectPk);
        await this.store.removeManyByPks(pks);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks });
    }

    async clear(): Promise<void> {
        await this.store.clear();
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [] });
    }

    async countAll(): Promise<number> {
        return await this.store.countAll();
    }

    async getAll(): Promise<TEntity[]> {
        return await this.store.getAll();
    }

    async getAllPks(): Promise<TPk[]> {
        return await this.store.getAllPks();
    }

    protected async upsertOneWithoutNotifications(entity: TEntity): Promise<TPk> {
        const pk = this.selectPk(entity);
        const existingEntity = await this.store.getOneByPk(pk);
        if (existingEntity) {
            await this.store.setOneByPk(
                pk,
                this.updateEntity(entity, existingEntity)
            );
        } else {
            await this.store.setOneByPk(pk, entity);
        }
        return pk;
    }
}

