import { IOIMCollectionStoreAsync } from '../src/interfaces/IOIMCollectionStoreAsync';
import { TOIMPk } from '@oimdb/core';

/**
 * Mock async collection store for testing.
 * Stores data in memory but simulates async operations.
 */
export class OIMCollectionStoreAsyncMock<
    TEntity extends object,
    TPk extends TOIMPk,
> implements IOIMCollectionStoreAsync<TEntity, TPk>
{
    private readonly entities = new Map<TPk, TEntity>();

    async setOneByPk(pk: TPk, entity: TEntity): Promise<void> {
        // Simulate async delay
        await Promise.resolve();
        this.entities.set(pk, entity);
    }

    async removeOneByPk(pk: TPk): Promise<void> {
        await Promise.resolve();
        this.entities.delete(pk);
    }

    async removeManyByPks(pks: readonly TPk[]): Promise<void> {
        await Promise.resolve();
        for (const pk of pks) {
            this.entities.delete(pk);
        }
    }

    async getOneByPk(pk: TPk): Promise<TEntity | undefined> {
        await Promise.resolve();
        return this.entities.get(pk);
    }

    async getManyByPks(pks: readonly TPk[]): Promise<TEntity[]> {
        await Promise.resolve();
        return pks
            .map(pk => this.entities.get(pk))
            .filter((entity): entity is TEntity => entity !== undefined);
    }

    async getAll(): Promise<TEntity[]> {
        await Promise.resolve();
        return Array.from(this.entities.values());
    }

    async getAllPks(): Promise<TPk[]> {
        await Promise.resolve();
        return Array.from(this.entities.keys());
    }

    async countAll(): Promise<number> {
        await Promise.resolve();
        return this.entities.size;
    }

    async clear(): Promise<void> {
        await Promise.resolve();
        this.entities.clear();
    }
}
