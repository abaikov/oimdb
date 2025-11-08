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
        // Direct delete instead of method call for better performance
        for (const pk of pks) {
            this.entities.delete(pk);
        }
    }

    getOneByPk(pk: TPk): TEntity | undefined {
        return this.entities.get(pk);
    }

    getManyByPks(pks: readonly TPk[]): TEntity[] {
        // Single pass instead of map + filter to avoid intermediate arrays
        const result: TEntity[] = [];
        result.length = pks.length; // Pre-size for better performance
        let writeIndex = 0;
        for (let i = 0; i < pks.length; i++) {
            const entity = this.getOneByPk(pks[i]);
            if (entity !== undefined) {
                result[writeIndex++] = entity;
            }
        }
        result.length = writeIndex; // Trim to actual size
        return result;
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
