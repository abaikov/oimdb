import { TOIMKey } from '../types/TOIMKey';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { TOIMEntityUpdater } from '../types/TOIMEntityUpdater';
import { OIMFieldMaskRegistry } from './OIMFieldMaskRegistry';

/**
 * Applies a write to a slot.
 *
 * The slot is where an entity's identity, its current value and its pending
 * change all meet, so "how a write lands" belongs here rather than being spread
 * between the collection (which held the updater) and the emitter (which held
 * the dirty flag). A collection owns one writer and calls it for every upsert;
 * the writer decides what changed and whether anyone needs to hear about it.
 *
 * This base writer answers "did anything change?" with "assume yes" — the
 * historical behaviour. {@link OIMSlotWriterFieldMasked} answers it precisely.
 */
export class OIMSlotWriter<TEntity extends object, TPk extends TOIMKey> {
    protected readonly updateEntity: TOIMEntityUpdater<TEntity>;
    /**
     * Field identity, when this writer tracks fields. `undefined` here — the
     * plain writer records nothing — and reading it is how the collection knows
     * whether field-scoped declarations are meaningful at all.
     */
    public readonly fields?: OIMFieldMaskRegistry;

    constructor(updateEntity: TOIMEntityUpdater<TEntity>) {
        this.updateEntity = updateEntity;
    }

    /**
     * Merge `patch` into the slot's entity.
     *
     * Returns whether the write should be published. Always `true` here: without
     * tracking fields there is no cheap way to know that a write changed nothing,
     * and staying silent on a real change is far worse than one extra wakeup.
     */
    public write(
        slot: TOIMEntitySlot<TEntity, TPk>,
        patch: Partial<TEntity>
    ): boolean {
        const current = slot.item;
        if (current === undefined) return true;
        slot.item = this.updateEntity(patch, current);
        return true;
    }
}
