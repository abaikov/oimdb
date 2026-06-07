import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { TOIMPk } from '../types/TOIMPk';
import { OIMCollection } from './OIMCollection';
import { OIMEventQueue } from './OIMEventQueue';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { IOIMKeyedSubscription } from '../interfaces/IOIMKeyedSubscription';
import { OIMCarrierKeyedEmitter } from './OIMCarrierKeyedEmitter';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';

export class OIMReactiveCollection<TEntity extends object, TPk extends TOIMPk>
    extends OIMCollection<TEntity, TPk>
    implements IOIMKeyedSubscription<TPk>
{
    private readonly queue: OIMEventQueue;
    // Slot-based keyed delivery: handlers live on the entity slot, so marking
    // and notifying need no per-key map lookup on the hot path.
    protected readonly updateEmitter: OIMCarrierKeyedEmitter<
        TPk,
        TOIMEntitySlot<TEntity, TPk>
    >;

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
        this.updateEmitter = new OIMCarrierKeyedEmitter(queue, {
            getOrReserveCarrier: (pk: TPk) => this.store.getOrReserveSlotByPk(pk),
            findCarrier: (pk: TPk) => this.store.findSlotByPk(pk),
        });
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

    // The legacy `emitter` (EOIMCollectionEventType.UPDATE) coexists with the
    // keyed `updateEmitter`. Build its payload only when something is actually
    // subscribed — otherwise every upsert/remove allocates a throwaway
    // `{ pks }` object (and array) that nobody reads.
    private notifyLegacy(pk: TPk): void {
        if (this.emitter.hasHandlers(EOIMCollectionEventType.UPDATE)) {
            this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
        }
    }

    private notifyLegacyMany(pks: readonly TPk[]): void {
        if (this.emitter.hasHandlers(EOIMCollectionEventType.UPDATE)) {
            this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks });
        }
    }

    public override upsertOneByPk(
        pk: TPk,
        entity: Partial<TEntity>
    ): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.upsertOneWithoutNotificationsByPk(pk, entity);
        this.notifyLegacy(pk);
        this.updateEmitter.markUpdatedCarrier(slot);
        this.trackAnyUpdatePk(pk);
        return slot;
    }

    public override upsertOne(
        entity: TEntity | Partial<TEntity>
    ): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.upsertOneWithoutNotifications(entity);
        this.notifyLegacy(slot.pk);
        this.updateEmitter.markUpdatedCarrier(slot);
        this.trackAnyUpdatePk(slot.pk);
        return slot;
    }

    public override upsertMany(
        entities: (TEntity | Partial<TEntity>)[]
    ): TOIMEntitySlot<TEntity, TPk>[] {
        if (entities.length === 0) return [];

        const slots = entities.map(entity =>
            this.upsertOneWithoutNotifications(entity)
        );
        const pks = slots.map(slot => slot.pk);
        this.notifyLegacyMany(pks);
        for (let i = 0; i < slots.length; i++) {
            this.updateEmitter.markUpdatedCarrier(slots[i]);
        }
        this.trackAnyUpdatePks(pks);
        return slots;
    }

    public override removeOne(entity: TEntity): void {
        const pk = this.selectPk(entity);
        this.store.removeOneByPk(pk);
        this.notifyLegacy(pk);
        this.updateEmitter.markUpdatedKey(pk);
        this.trackAnyUpdatePk(pk);
    }

    public override removeMany(entities: TEntity[]): void {
        if (entities.length === 0) return;

        const pks = entities.map(this.selectPk);
        this.store.removeManyByPks(pks);
        this.notifyLegacyMany(pks);
        this.updateEmitter.markUpdatedKeys(pks);
        this.trackAnyUpdatePks(pks);
    }

    public override removeOneByPk(pk: TPk): void {
        this.store.removeOneByPk(pk);
        this.notifyLegacy(pk);
        this.updateEmitter.markUpdatedKey(pk);
        this.trackAnyUpdatePk(pk);
    }

    public override removeManyByPks(pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        this.store.removeManyByPks(pks);
        this.notifyLegacyMany(pks);
        this.updateEmitter.markUpdatedKeys(pks);
        this.trackAnyUpdatePks(pks);
    }

    public override clear(): void {
        this.store.clear();
        // clear() removes every key, so the individually-changed keys are
        // unknown. On the legacy UPDATE event an empty `pks` is the agreed
        // "rebuild from scratch" signal (derived indexes act on
        // `pks.length === 0`). Emit it only if something is subscribed.
        if (this.emitter.hasHandlers(EOIMCollectionEventType.UPDATE)) {
            this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [] });
        }
        // Keyed subscribers are notified separately across all known keys.
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
