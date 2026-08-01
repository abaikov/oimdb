import { TOIMKey } from '../types/TOIMKey';
import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { OIMCollection } from './OIMCollection';
import { OIMEventQueue } from './OIMEventQueue';
import {
    IOIMCarrierProvider,
    OIMCarrierKeyedEmitter,
} from './OIMCarrierKeyedEmitter';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';

/**
 * `TEmitter` is what decides how much this collection knows about its own writes.
 *
 * The default is the plain keyed emitter and every existing usage keeps that,
 * unchanged. Passing `OIMCarrierKeyedFieldEmitter` instead gets a collection
 * whose subscribers can name the fields they care about.
 *
 * The collection does not mirror its emitter's methods — subscribe through
 * `collection.emitter`. That is what makes the capability honest: the
 * emitter's type IS the type parameter, so `subscribeOnKeyFields` is present
 * exactly when a field emitter was installed and absent otherwise, decided by the
 * compiler. A forwarding method on the collection could not do that; it would
 * have to exist unconditionally and refuse at runtime, which is an error for
 * being built wrong rather than a design that cannot be built wrong.
 *
 * Field tracking has two halves and both are opt-in. The slot writer
 * (`OIMSlotWriterFieldMasked`) RECORDS which fields a write touched and owns the
 * only field registry, reachable as `collection.fields`; the field emitter READS
 * that record to filter deliveries. Install the emitter without the writer and
 * there is nothing to read — masks are absent, which every field-scoped
 * subscriber reads as "everything changed", so it wakes on every write.
 */
export class OIMReactiveCollection<
        TEntity extends object,
        TPk extends TOIMKey,
        TEmitter extends OIMCarrierKeyedEmitter<
            TPk,
            TOIMEntitySlot<TEntity, TPk>
        > = OIMCarrierKeyedEmitter<TPk, TOIMEntitySlot<TEntity, TPk>>,
    >
    extends OIMCollection<TEntity, TPk> {
    private readonly queue: OIMEventQueue;
    // Slot-based keyed delivery: handlers live on the entity slot, so marking
    // and notifying need no per-key map lookup on the hot path.
    public readonly emitter: TEmitter;

    private readonly anyUpdateHandlers = new Set<
        (pks: readonly TPk[]) => void
    >();
    // Only ever holds `slot.pk` (one canonical reference per logical key), so a
    // native `Set` dedups correctly by reference even for composite pks.
    private readonly pendingAnyUpdatePks = new Set<TPk>();
    private isAnyUpdateScheduled = false;

    constructor(
        queue: OIMEventQueue,
        opts?: TOIMCollectionOptions<TEntity, TPk> & {
            /**
             * Build the keyed emitter this collection delivers through. Omit for
             * the plain one; supply `OIMCarrierKeyedFieldEmitter` to opt into
             * field-level tracking. The provider is handed in rather than built
             * by the caller so the slot store stays private.
             */
            createUpdateEmitter?: (
                queue: OIMEventQueue,
                carrierProvider: IOIMCarrierProvider<
                    TPk,
                    TOIMEntitySlot<TEntity, TPk>
                >
            ) => TEmitter;
        }
    ) {
        super(opts);
        this.queue = queue;
        const carrierProvider: IOIMCarrierProvider<
            TPk,
            TOIMEntitySlot<TEntity, TPk>
        > = {
            getOrReserveCarrier: (pk: TPk) => this.store.getOrReserveSlotByPk(pk),
            findCarrier: (pk: TPk) => this.store.findSlotByPk(pk),
        };
        this.emitter = opts?.createUpdateEmitter
            ? opts.createUpdateEmitter(queue, carrierProvider)
            : (new OIMCarrierKeyedEmitter(queue, carrierProvider) as TEmitter);
    }






    public destroySubscriptions(): void {
        this.emitter.destroy();
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
    //   • the keyed `emitter` — per-key/per-carrier pings ("did MY key
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
        if (this.batchEmitter.hasHandlers(EOIMCollectionEventType.UPDATE)) {
            this.batchEmitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
        }
    }

    private notifyBatchMany(pks: readonly TPk[]): void {
        if (this.batchEmitter.hasHandlers(EOIMCollectionEventType.UPDATE)) {
            this.batchEmitter.emit(EOIMCollectionEventType.UPDATE, { pks });
        }
    }

    public override upsertOneByPk(
        pk: TPk,
        entity: Partial<TEntity>
    ): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.upsertOneWithoutNotificationsByPk(pk, entity);
        // A writer that compares values reports `false` when the write changed
        // nothing: no carrier marked, no batch event, no index resync. A plain
        // writer always reports `true`, so this path is unchanged for it.
        if (slot.published === false) return slot;
        // Carrier BEFORE batch: the batch channel is synchronous and a derived
        // index reads the slot inside that call, so anything the writer attached
        // to the slot has to be there already. Marking only queues the carrier —
        // nothing is delivered until the flush — so the swap changes no
        // observable ordering.
        this.emitter.markUpdatedCarrier(slot, entity);
        this.notifyBatch(pk);
        this.trackAnyUpdatePk(pk);
        return slot;
    }

    public override upsertOne(
        entity: TEntity | Partial<TEntity>
    ): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.upsertOneWithoutNotifications(entity);
        if (slot.published === false) return slot;
        this.emitter.markUpdatedCarrier(slot, entity);
        this.notifyBatch(slot.pk);
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
        // Only the slots the writer actually published take part in the batch —
        // a push that rewrites 1,000 rows to the values they already held ends
        // up notifying nobody.
        const changed: TOIMEntitySlot<TEntity, TPk>[] = [];
        for (let i = 0; i < slots.length; i++) {
            if (slots[i].published === false) continue;
            this.emitter.markUpdatedCarrier(slots[i], entities[i]);
            changed.push(slots[i]);
        }
        if (changed.length === 0) return slots;
        const pks = changed.map(slot => slot.pk);
        this.notifyBatchMany(pks);
        this.trackAnyUpdatePks(pks);
        return slots;
    }

    public override removeOne(entity: TEntity): void {
        const pk = this.selectPk(entity);
        this.store.removeOneByPk(pk);
        this.emitter.markUpdatedKey(pk);
        this.notifyBatch(pk);
        this.trackAnyUpdatePk(pk);
    }

    public override removeMany(entities: TEntity[]): void {
        if (entities.length === 0) return;

        const pks = entities.map(this.selectPk);
        this.store.removeManyByPks(pks);
        this.emitter.markUpdatedKeys(pks);
        this.notifyBatchMany(pks);
        this.trackAnyUpdatePks(pks);
    }

    public override removeOneByPk(pk: TPk): void {
        this.store.removeOneByPk(pk);
        this.emitter.markUpdatedKey(pk);
        this.notifyBatch(pk);
        this.trackAnyUpdatePk(pk);
    }

    public override removeManyByPks(pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        this.store.removeManyByPks(pks);
        this.emitter.markUpdatedKeys(pks);
        this.notifyBatchMany(pks);
        this.trackAnyUpdatePks(pks);
    }

    public override clear(): void {
        // clear() removes every present key. Capture those keys BEFORE clearing
        // so the batch + anyUpdate channels report exactly which keys changed —
        // an empty `pks` never means "reset", it means "nothing changed". Build
        // the key array only when a channel that needs it is subscribed.
        const needsPks =
            this.batchEmitter.hasHandlers(EOIMCollectionEventType.UPDATE) ||
            this.anyUpdateHandlers.size > 0;
        const pks = needsPks ? this.store.getAllPks() : undefined;
        this.store.clear();
        if (pks && pks.length > 0) {
            this.notifyBatchMany(pks);
            this.trackAnyUpdatePks(pks);
        }
        // Keyed subscribers are notified across all subscribed carriers; this is
        // carrier-based and needs no pk list, so it works after the store clear.
        this.emitter.markAllUpdated();
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
        this.emitter.destroy();
        if (this.isAnyUpdateScheduled) {
            this.queue.cancel(this.runAnyUpdate);
            this.isAnyUpdateScheduled = false;
        }
        this.anyUpdateHandlers.clear();
        this.pendingAnyUpdatePks.clear();
        super.destroy();
    }
}
