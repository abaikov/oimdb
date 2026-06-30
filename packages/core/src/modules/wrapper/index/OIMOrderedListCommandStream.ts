import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { EOIMEventQueueEventType } from '../../../enums/EOIMEventQueueEventType';
import { EOIMIndexEventType } from '../../../enums/EOIMIndexEventType';
import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMIndexUpdatePayload } from '../../../types/TOIMIndexUpdatePayload';
import { TOIMEntitySlot } from '../../../types/TOIMEntitySlot';
import { IOIMOrderedListCommandSource } from '../../../interfaces/IOIMOrderedListCommandSource';
import { TOIMOrderedListCommand } from './TOIMOrderedListCommand';
import { OIMIndexManualOrderedArrayBased } from './OIMIndexManualOrderedArrayBased';

/**
 * Slot-first ordered-list command stream.
 *
 * Emits position-addressed {@link TOIMOrderedListCommand}s whose `item` is the
 * entity slot. Use this when you already have slots and want incremental
 * commands for an imperative renderer. For PK writes bound to a collection, use
 * `OIMCollectionOrderedListCommandStream`.
 *
 * Implements {@link IOIMOrderedListCommandSource} (with the slot as the element)
 * so it can be projected element-wise via
 * `createOIMOrderedListMappedCommandStream`.
 */
export class OIMOrderedListCommandStream<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TEntity extends object = object,
> implements IOIMOrderedListCommandSource<TKey, TOIMEntitySlot<TEntity, TPk>>
{
    public readonly commandsEventEmitter: OIMUpdateEventEmitter<TKey>;
    private readonly unsubscribeAfterFlush: () => void;
    private readonly unsubscribeFromIndexEmitter: () => void;
    protected isInWrite = false;

    private readonly commandsByKey = new Map<
        TKey,
        TOIMOrderedListCommand<TOIMEntitySlot<TEntity, TPk>>[]
    >();

    /** Underlying slot-first ordered index. */
    public readonly index: OIMIndexManualOrderedArrayBased<TKey, TPk>;

    constructor(
        queue: OIMEventQueue,
        index?: OIMIndexManualOrderedArrayBased<TKey, TPk>
    ) {
        this.commandsEventEmitter = new OIMUpdateEventEmitter<TKey>(
            queue,
            'after_flush'
        );
        this.index =
            index ?? new OIMIndexManualOrderedArrayBased<TKey, TPk>();

        this.unsubscribeAfterFlush = queue.emitter.on(
            EOIMEventQueueEventType.AFTER_FLUSH,
            this.onAfterFlush
        );

        // If the index is mutated directly, emit a full `reset` command to resync.
        this.unsubscribeFromIndexEmitter = this.index.emitter.on(
            EOIMIndexEventType.UPDATE,
            this.onIndexUpdate
        );
    }

    public getPksByKey(key: TKey): readonly TPk[] {
        return this.index.getPksByKey(key);
    }

    public getSlotsByKey(
        key: TKey
    ): readonly TOIMEntitySlot<TEntity, TPk>[] {
        return this.index.getSlotsByKey(
            key
        ) as readonly TOIMEntitySlot<TEntity, TPk>[];
    }

    /** {@link IOIMOrderedListCommandSource} — alias of {@link getSlotsByKey}. */
    public getItemsByKey(
        key: TKey
    ): readonly TOIMEntitySlot<TEntity, TPk>[] {
        return this.getSlotsByKey(key);
    }

    /** {@link IOIMOrderedListCommandSource} — per-key command subscription. */
    public subscribeCommands(key: TKey, handler: () => void): () => void {
        return this.commandsEventEmitter.subscribeOnKey(key, handler);
    }

    public getEntitiesByKey(key: TKey): (TEntity | undefined)[] {
        return this.index.getEntitiesByKey<TEntity>(key);
    }

    public hasKey(key: TKey): boolean {
        return this.index.hasKey(key);
    }

    public getKeys(): readonly TKey[] {
        return this.index.getKeys();
    }

    public pushSlot(key: TKey, slot: TOIMEntitySlot<TEntity, TPk>): void {
        this.withWrite(() => {
            const index = this.index.pushSlot(key, slot);
            this.appendCommand(key, { type: 'insert', index, item: slot });
        });
    }

    public insertSlotAt(
        key: TKey,
        index: number,
        slot: TOIMEntitySlot<TEntity, TPk>
    ): void {
        this.withWrite(() => {
            const safeIndex = this.index.insertSlotAt(key, index, slot);
            this.appendCommand(key, {
                type: 'insert',
                index: safeIndex,
                item: slot,
            });
        });
    }

    /** Replace the slot at `index` in place. */
    public setSlotAt(
        key: TKey,
        index: number,
        slot: TOIMEntitySlot<TEntity, TPk>
    ): void {
        this.withWrite(() => {
            const safeIndex = this.index.setSlotAt(key, index, slot);
            if (safeIndex < 0) return;
            this.appendCommand(key, {
                type: 'set',
                index: safeIndex,
                item: slot,
            });
        });
    }

    public removeAt(key: TKey, index: number): void {
        this.withWrite(() => {
            const slot = this.index.removeAt(key, index);
            if (slot === undefined) return;
            this.appendCommand(key, { type: 'remove', index });
        });
    }

    /** Remove `count` consecutive elements from `index`; emits `remove` with `count`. */
    public removeRange(key: TKey, index: number, count: number): void {
        this.withWrite(() => {
            const removed = this.index.removeRange(key, index, count);
            if (removed <= 0) return;
            this.appendCommand(key, { type: 'remove', index, count: removed });
        });
    }

    public move(key: TKey, fromIndex: number, toIndex: number): void {
        this.withWrite(() => {
            const slot = this.index.move(key, fromIndex, toIndex);
            if (slot === undefined) return;
            this.appendCommand(key, {
                type: 'move',
                from: fromIndex,
                to: toIndex,
            });
        });
    }

    /**
     * Move `count` consecutive elements from `from` to `to`; emits `move` with
     * `count`. `to` is in the post-extraction coordinate space (as single `move`).
     */
    public moveRange(
        key: TKey,
        from: number,
        to: number,
        count: number
    ): void {
        this.withWrite(() => {
            const moved = this.index.moveRange(key, from, to, count);
            if (moved <= 0) return;
            this.appendCommand(key, { type: 'move', from, to, count: moved });
        });
    }

    public setSlots(
        key: TKey,
        slots: readonly TOIMEntitySlot<TEntity, TPk>[]
    ): void {
        this.withWrite(() => {
            this.index.resetSlots(key, slots);
            this.appendResetCommand(key, slots);
        });
    }

    public getBufferedCommands(
        key: TKey
    ): readonly TOIMOrderedListCommand<TOIMEntitySlot<TEntity, TPk>>[] {
        return this.commandsByKey.get(key) ?? [];
    }

    public consumeCommands(
        key: TKey
    ): TOIMOrderedListCommand<TOIMEntitySlot<TEntity, TPk>>[] {
        const cmds = this.commandsByKey.get(key);
        if (!cmds || cmds.length === 0) return [];
        return cmds.slice();
    }

    public clear(key?: TKey): void {
        if (key === undefined) {
            this.index.destroy();
            this.commandsByKey.clear();
            return;
        }
        this.index.clear(key);
        this.commandsByKey.delete(key);
    }

    public destroy(): void {
        this.commandsEventEmitter.destroy();
        this.unsubscribeAfterFlush();
        this.unsubscribeFromIndexEmitter();
        this.clear();
    }

    private readonly onAfterFlush = () => {
        this.commandsByKey.clear();
    };

    private readonly onIndexUpdate = (
        payload: TOIMIndexUpdatePayload<TKey>
    ) => {
        if (this.isInWrite) return;
        if (payload.keys.length === 0) return;

        for (let i = 0; i < payload.keys.length; i++) {
            const key = payload.keys[i];
            this.appendResetCommand(key, this.getSlotsByKey(key));
        }
    };

    protected withWrite(fn: () => void): void {
        if (this.isInWrite) {
            fn();
            return;
        }
        this.isInWrite = true;
        try {
            fn();
        } finally {
            this.isInWrite = false;
        }
    }

    protected appendCommand(
        key: TKey,
        cmd: TOIMOrderedListCommand<TOIMEntitySlot<TEntity, TPk>>
    ): void {
        let cmds = this.commandsByKey.get(key);
        if (!cmds) {
            cmds = [];
            this.commandsByKey.set(key, cmds);
        }

        if (cmd.type === 'reset') {
            // A full reset supersedes everything buffered so far.
            cmds.length = 0;
            cmds.push(cmd);
        } else if (cmds.length > 0 && cmds[0].type === 'reset') {
            // Once the batch starts with a reset, fold later structural edits
            // into a fresh reset that reflects the current list.
            cmds[0] = this.createResetCommand(this.getSlotsByKey(key));
        } else {
            cmds.push(cmd);
        }

        this.commandsEventEmitter.markUpdatedKeys([key]);
    }

    protected appendResetCommand(
        key: TKey,
        slots: readonly TOIMEntitySlot<TEntity, TPk>[]
    ): void {
        this.appendCommand(key, this.createResetCommand(slots));
    }

    protected createResetCommand(
        slots: readonly TOIMEntitySlot<TEntity, TPk>[]
    ): TOIMOrderedListCommand<TOIMEntitySlot<TEntity, TPk>> {
        return { type: 'reset', items: slots };
    }
}
