import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { TOIMPk } from '../types/TOIMPk';
import { OIMCollection } from './OIMCollection';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMUpdateEventCoalescerCollection } from './OIMUpdateEventCoalescerCollection';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';

export class OIMReactiveCollection<TEntity extends object, TPk extends TOIMPk> {
    public readonly collection: OIMCollection<TEntity, TPk>;
    public readonly updateEventEmitter: OIMUpdateEventEmitter<TPk>;
    public readonly coalescer: OIMUpdateEventCoalescerCollection<TPk>;

    constructor(
        queue: OIMEventQueue,
        opts?: {
            collectionOpts?: TOIMCollectionOptions<TEntity, TPk>;
        }
    ) {
        this.collection = new OIMCollection<TEntity, TPk>(opts?.collectionOpts);
        this.coalescer = new OIMUpdateEventCoalescerCollection<TPk>(
            this.collection.emitter
        );
        this.updateEventEmitter = new OIMUpdateEventEmitter<TPk>({
            coalescer: this.coalescer,
            queue,
        });
    }

    public upsertMany(entities: TEntity[]): void {
        this.collection.upsertMany(entities);
    }

    public upsertOne(entity: TEntity): void {
        this.collection.upsertOne(entity);
    }

    public removeMany(entities: TEntity[]): void {
        this.collection.removeMany(entities);
    }

    public removeOne(entity: TEntity): void {
        this.collection.removeOne(entity);
    }

    public getOneByPk(pk: TPk): TEntity | undefined {
        return this.collection.getOneByPk(pk);
    }

    public getManyByPks(pks: readonly TPk[]): Map<TPk, TEntity | undefined> {
        return this.collection.getManyByPks(pks);
    }
}
