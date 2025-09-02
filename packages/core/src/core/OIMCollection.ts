import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMPkSelector } from '../types/TOIMPkSelector';
import { OIMPkSelectorFactory } from './OIMPkSelectorFactory';
import { OIMCollectionStoreMapDriven } from './OIMCollectionStoreMapDriven';
import { OIMCollectionStore } from '../abstract/OIMCollectionStore';
import { TOIMEntityUpdater } from '../types/TOIMEntityUpdater';
import { OIMEntityUpdaterFactory } from './OIMEntityUpdaterFactory';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMCollectionEventType } from '../enum/EOIMCollectionEventType';
import { TOIMCollectionUpdatePayload } from '../types/TOIMCollectionUpdatePayload';

/** It's like a store - but with event emitter */
export class OIMCollection<TEntity extends object, TPk extends TOIMPk> {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMCollectionEventType.UPDATE]: TOIMCollectionUpdatePayload<TPk>;
    }>();
    protected readonly selectPk: TOIMPkSelector<TEntity, TPk>;
    protected readonly store: OIMCollectionStore<TEntity, TPk>;
    protected readonly updateEntity: TOIMEntityUpdater<TEntity>;

    constructor(opts?: TOIMCollectionOptions<TEntity, TPk>) {
        this.selectPk = (opts?.selectPk ??
            new OIMPkSelectorFactory<
                TEntity & { id: TPk },
                TPk
            >().createIdSelector()) as TOIMPkSelector<TEntity, TPk>;
        this.store =
            opts?.store ?? new OIMCollectionStoreMapDriven<TEntity, TPk>();
        this.updateEntity =
            opts?.updateEntity ??
            new OIMEntityUpdaterFactory<TEntity>().createMergeEntityUpdater();
    }

    getOneByPk(pk: TPk): TEntity | undefined {
        return this.store.getOneByPk(pk);
    }

    getManyByPks(pks: readonly TPk[]): Map<TPk, TEntity | undefined> {
        return this.store.getManyByPks(pks);
    }

    upsertOne(entity: TEntity): void {
        const pk = this.upsertOneWithoutNotifications(entity);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
    }

    upsertMany(entities: TEntity[]): void {
        const pks = entities.map(entity =>
            this.upsertOneWithoutNotifications(entity)
        );
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks });
    }

    removeOne(entity: TEntity): void {
        const pk = this.selectPk(entity);
        this.store.removeOneByPk(pk);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
    }

    removeMany(entities: TEntity[]): void {
        const pks = entities.map(this.selectPk);
        this.store.removeManyByPks(pks);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks });
    }

    protected upsertOneWithoutNotifications(entity: TEntity): TPk {
        const pk = this.selectPk(entity);
        const existingEntity = this.store.getOneByPk(pk);
        if (existingEntity) {
            this.store.setOneByPk(
                pk,
                this.updateEntity(entity, existingEntity)
            );
        } else {
            this.store.setOneByPk(pk, entity);
        }
        return pk;
    }
}
