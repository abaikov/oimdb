import { TOIMPk } from '../types/TOIMPk';
import { OIMCollectionStore } from '../abstract/OIMCollectionStore';

export class OIMCollectionStoreMapDriven<
    TEntity extends object,
    TPk extends TOIMPk,
> extends OIMCollectionStore<TEntity, TPk> {
    protected readonly entities = new Map<TPk, TEntity>();

    setOneByPk(pk: TPk, entity: TEntity): void {
        this.entities.set(pk, entity);
    }

    setManyByPks(pks: readonly TPk[], entities: TEntity[]): void {
        for (let i = 0; i < pks.length; i++) {
            this.entities.set(pks[i], entities[i]);
        }
    }

    removeOneByPk(pk: TPk): void {
        this.entities.delete(pk);
    }

    removeManyByPks(pks: readonly TPk[]): void {
        for (const pk of pks) {
            this.removeOneByPk(pk);
        }
    }

    getOneByPk(pk: TPk): TEntity | undefined {
        return this.entities.get(pk);
    }

    getManyByPks(pks: readonly TPk[]): TEntity[] {
        return pks.map(pk => this.getOneByPk(pk)).filter(Boolean) as TEntity[];
    }

    getAll(): TEntity[] {
        return Array.from(this.entities.values());
    }

    countAll(): number {
        return this.entities.size;
    }

    clear(): void {
        this.entities.clear();
    }

    getAllPks(): TPk[] {
        return Array.from(this.entities.keys());
    }
}
