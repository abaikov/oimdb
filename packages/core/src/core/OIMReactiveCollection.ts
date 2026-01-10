import { TOIMCollectionOptions } from '../type/TOIMCollectionOptions';
import { TOIMPk } from '../type/TOIMPk';
import { OIMCollection } from './OIMCollection';
import { OIMEventQueue } from './OIMEventQueue';
import { TOIMEventHandler } from '../type/TOIMEventHandler';
import { IOIMKeyedSubscription } from '../interfaces/IOIMKeyedSubscription';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';

export class OIMReactiveCollection<TEntity extends object, TPk extends TOIMPk>
    extends OIMCollection<TEntity, TPk>
    implements IOIMKeyedSubscription<TPk>
{
    private readonly queue: OIMEventQueue;
    protected readonly updateEmitter: OIMUpdateEventEmitter<TPk>;

    private readonly anyUpdateHandlers = new Set<
        (pks: readonly TPk[]) => void
    >();
    private pendingAnyUpdatePks = new Set<TPk>();
    private isAnyUpdateClearPending = false;
    private isAnyUpdateScheduled = false;
    private dequeueAnyUpdate?: () => void;

    constructor(
        queue: OIMEventQueue,
        opts?: TOIMCollectionOptions<TEntity, TPk>
    ) {
        super(opts);
        this.queue = queue;
        this.updateEmitter = new OIMUpdateEventEmitter<TPk>(queue, 'queue');
    }

    public subscribeOnKey(
        pk: TPk,
        handler: TOIMEventHandler<void>
    ): () => void {
        return this.updateEmitter.subscribeOnKey(pk, handler);
    }

    public subscribeOnKeys(
        pks: readonly TPk[],
        handler: TOIMEventHandler<void>
    ): () => void {
        return this.updateEmitter.subscribeOnKeys(pks, handler);
    }

    public unsubscribeFromKey(pk: TPk, handler: TOIMEventHandler<void>): void {
        this.updateEmitter.unsubscribeFromKey(pk, handler);
    }

    public unsubscribeFromKeys(
        pks: readonly TPk[],
        handler: TOIMEventHandler<void>
    ): void {
        this.updateEmitter.unsubscribeFromKeys(pks, handler);
    }

    public destroySubscriptions(): void {
        this.updateEmitter.destroy();
    }

    public hasSubscriptions(): boolean {
        return this.updateEmitter.hasSubscriptions();
    }

    public getHandlerCount(pk: TPk): number {
        return this.updateEmitter.getHandlerCount(pk);
    }

    public getMetrics(): {
        totalKeys: number;
        totalHandlers: number;
        averageHandlersPerKey: number;
        queueLength: number;
    } {
        return this.updateEmitter.getMetrics();
    }

    public subscribeOnAnyUpdate(
        handler: (pks: readonly TPk[]) => void
    ): () => void {
        this.anyUpdateHandlers.add(handler);
        return () => {
            this.anyUpdateHandlers.delete(handler);
        };
    }

    public override upsertOneByPk(pk: TPk, entity: Partial<TEntity>): void {
        this.upsertOneWithoutNotificationsByPk(pk, entity);
        this.updateEmitter.markUpdatedKey(pk);
        this.trackAnyUpdatePk(pk);
    }

    public override upsertOne(entity: TEntity | Partial<TEntity>): void {
        const pk = this.upsertOneWithoutNotifications(entity);
        this.updateEmitter.markUpdatedKey(pk);
        this.trackAnyUpdatePk(pk);
    }

    public override upsertMany(entities: (TEntity | Partial<TEntity>)[]): void {
        const pks = entities.map(entity =>
            this.upsertOneWithoutNotifications(entity)
        );
        this.updateEmitter.markUpdatedKeys(pks);
        this.trackAnyUpdatePks(pks);
    }

    public override removeOne(entity: TEntity): void {
        const pk = this.selectPk(entity);
        this.store.removeOneByPk(pk);
        this.updateEmitter.markUpdatedKey(pk);
        this.trackAnyUpdatePk(pk);
    }

    public override removeMany(entities: TEntity[]): void {
        const pks = entities.map(this.selectPk);
        this.store.removeManyByPks(pks);
        this.updateEmitter.markUpdatedKeys(pks);
        this.trackAnyUpdatePks(pks);
    }

    public override removeOneByPk(pk: TPk): void {
        this.store.removeOneByPk(pk);
        this.updateEmitter.markUpdatedKey(pk);
        this.trackAnyUpdatePk(pk);
    }

    public override removeManyByPks(pks: readonly TPk[]): void {
        this.store.removeManyByPks(pks);
        this.updateEmitter.markUpdatedKeys(pks);
        this.trackAnyUpdatePks(pks);
    }

    public override clear(): void {
        this.store.clear();
        // Unknown keys: notify all subscribed keys.
        this.updateEmitter.markAllUpdated();
        this.trackAnyUpdateClear();
    }

    private trackAnyUpdatePk(pk: TPk): void {
        if (this.anyUpdateHandlers.size === 0) return;
        this.pendingAnyUpdatePks.add(pk);
        this.ensureAnyUpdateEnqueued();
    }

    private trackAnyUpdatePks(pks: readonly TPk[]): void {
        if (this.anyUpdateHandlers.size === 0) return;
        for (let i = 0; i < pks.length; i++)
            this.pendingAnyUpdatePks.add(pks[i]);
        this.ensureAnyUpdateEnqueued();
    }

    private trackAnyUpdateClear(): void {
        if (this.anyUpdateHandlers.size === 0) return;
        this.isAnyUpdateClearPending = true;
        this.pendingAnyUpdatePks.clear();
        this.ensureAnyUpdateEnqueued();
    }

    private ensureAnyUpdateEnqueued(): void {
        if (this.isAnyUpdateScheduled) return;
        this.isAnyUpdateScheduled = true;
        this.dequeueAnyUpdate = this.queue.enqueue(this.runAnyUpdate);
    }

    private readonly runAnyUpdate = () => {
        if (!this.isAnyUpdateScheduled) return;
        this.isAnyUpdateScheduled = false;
        this.dequeueAnyUpdate = undefined;

        const pks = this.isAnyUpdateClearPending
            ? []
            : Array.from(this.pendingAnyUpdatePks);
        this.pendingAnyUpdatePks.clear();
        this.isAnyUpdateClearPending = false;

        const snapshot = Array.from(this.anyUpdateHandlers);
        for (let i = 0; i < snapshot.length; i++) snapshot[i](pks);
    };

    public override destroy(): void {
        this.updateEmitter.destroy();
        if (this.dequeueAnyUpdate) {
            this.dequeueAnyUpdate();
            this.dequeueAnyUpdate = undefined;
        }
        this.anyUpdateHandlers.clear();
        this.pendingAnyUpdatePks.clear();
        super.destroy();
    }
}
