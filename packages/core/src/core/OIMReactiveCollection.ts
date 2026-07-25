import { TOIMKey } from '../types/TOIMKey';
import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { OIMCollection } from './OIMCollection';
import { OIMEventQueue } from './OIMEventQueue';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { IOIMKeyedSubscription } from '../interfaces/IOIMKeyedSubscription';
import { OIMCarrierKeyedEmitter } from './OIMCarrierKeyedEmitter';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';

export class OIMReactiveCollection<TEntity extends object, TPk extends TOIMKey>
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
    // Only ever holds `slot.pk` (one canonical reference per logical key), so a
    // native `Set` dedups correctly by reference even for composite pks.
    private readonly pendingAnyUpdatePks = new Set<TPk>();
    private isAnyUpdateScheduled = false;

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

    // Two notification channels coexist on a reactive collection; they serve
    // different audiences and NEITHER is obsolete:
    //   • the keyed `updateEmitter` — per-key/per-carrier pings ("did MY key
    //     change?", payload-less `void`), for leaf subscribers like React hooks
    //     that declare the keys they care about up front;
    //   • this `emitter` UPDATE event — the aggregate/batch channel that carries
    //     the full list of changed pks in one SYNCHRONOUS callback, for
    //     consumers that do NOT know their keys ahead of time and must re-derive
    //     over the batch: derived indexes/collections, changed-fields, persist,
    //     snapshot-manager. `pks` always enumerates exactly what changed — even
    //     clear() lists every removed key, so an empty array never occurs.
    // It is not a per-key emitter with fewer features — it is the opposite
    // shape (enumerated batch, not "my key"), which is why it stays.
    //
    // Emit on the batch channel only when something is actually subscribed —
    // otherwise every upsert/remove allocates a throwaway `{ pks }` object (and
    // array) that nobody reads.
    private notifyBatch(pk: TPk): void {
        if (this.emitter.hasHandlers(EOIMCollectionEventType.UPDATE)) {
            this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
        }
    }

    private notifyBatchMany(pks: readonly TPk[]): void {
        if (this.emitter.hasHandlers(EOIMCollectionEventType.UPDATE)) {
            this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks });
        }
    }

    public override upsertOneByPk(
        pk: TPk,
        entity: Partial<TEntity>
    ): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.upsertOneWithoutNotificationsByPk(pk, entity);
        this.notifyBatch(pk);
        this.updateEmitter.markUpdatedCarrier(slot);
        this.trackAnyUpdatePk(pk);
        return slot;
    }

    public override upsertOne(
        entity: TEntity | Partial<TEntity>
    ): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.upsertOneWithoutNotifications(entity);
        this.notifyBatch(slot.pk);
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
        this.notifyBatchMany(pks);
        for (let i = 0; i < slots.length; i++) {
            this.updateEmitter.markUpdatedCarrier(slots[i]);
        }
        this.trackAnyUpdatePks(pks);
        return slots;
    }

    public override removeOne(entity: TEntity): void {
        const pk = this.selectPk(entity);
        this.store.removeOneByPk(pk);
        this.notifyBatch(pk);
        this.updateEmitter.markUpdatedKey(pk);
        this.trackAnyUpdatePk(pk);
    }

    public override removeMany(entities: TEntity[]): void {
        if (entities.length === 0) return;

        const pks = entities.map(this.selectPk);
        this.store.removeManyByPks(pks);
        this.notifyBatchMany(pks);
        this.updateEmitter.markUpdatedKeys(pks);
        this.trackAnyUpdatePks(pks);
    }

    public override removeOneByPk(pk: TPk): void {
        this.store.removeOneByPk(pk);
        this.notifyBatch(pk);
        this.updateEmitter.markUpdatedKey(pk);
        this.trackAnyUpdatePk(pk);
    }

    public override removeManyByPks(pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        this.store.removeManyByPks(pks);
        this.notifyBatchMany(pks);
        this.updateEmitter.markUpdatedKeys(pks);
        this.trackAnyUpdatePks(pks);
    }

    public override clear(): void {
        // clear() removes every present key. Capture those keys BEFORE clearing
        // so the batch + anyUpdate channels report exactly which keys changed —
        // an empty `pks` never means "reset", it means "nothing changed". Build
        // the key array only when a channel that needs it is subscribed.
        const needsPks =
            this.emitter.hasHandlers(EOIMCollectionEventType.UPDATE) ||
            this.anyUpdateHandlers.size > 0;
        const pks = needsPks ? this.store.getAllPks() : undefined;
        this.store.clear();
        if (pks && pks.length > 0) {
            this.notifyBatchMany(pks);
            this.trackAnyUpdatePks(pks);
        }
        // Keyed subscribers are notified across all subscribed carriers; this is
        // carrier-based and needs no pk list, so it works after the store clear.
        this.updateEmitter.markAllUpdated();
    }

    private trackAnyUpdatePk(pk: TPk): void {
        if (this.anyUpdateHandlers.size === 0) return;
        this.pendingAnyUpdatePks.add(pk);
        this.ensureAnyUpdateEnqueued();
    }

    private trackAnyUpdatePks(pks: readonly TPk[]): void {
        if (this.anyUpdateHandlers.size === 0) return;
        for (let i = 0; i < pks.length; i++)
            {this.pendingAnyUpdatePks.add(pks[i]);}
        this.ensureAnyUpdateEnqueued();
    }

    private ensureAnyUpdateEnqueued(): void {
        if (this.isAnyUpdateScheduled) return;
        this.isAnyUpdateScheduled = true;
        this.queue.enqueue(this.runAnyUpdate);
    }

    private readonly runAnyUpdate = () => {
        if (!this.isAnyUpdateScheduled) return;
        this.isAnyUpdateScheduled = false;

        const pks = Array.from(this.pendingAnyUpdatePks.values());
        this.pendingAnyUpdatePks.clear();

        const snapshot = Array.from(this.anyUpdateHandlers);
        for (let i = 0; i < snapshot.length; i++) snapshot[i](pks);
    };

    public override destroy(): void {
        this.updateEmitter.destroy();
        if (this.isAnyUpdateScheduled) {
            this.queue.cancel(this.runAnyUpdate);
            this.isAnyUpdateScheduled = false;
        }
        this.anyUpdateHandlers.clear();
        this.pendingAnyUpdatePks.clear();
        super.destroy();
    }
}
