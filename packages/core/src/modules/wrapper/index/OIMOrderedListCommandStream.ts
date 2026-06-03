import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { EOIMEventQueueEventType } from '../../../enums/EOIMEventQueueEventType';
import { EOIMIndexEventType } from '../../../enums/EOIMIndexEventType';
import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMIndexUpdatePayload } from '../../../types/TOIMIndexUpdatePayload';
import { TOIMEntitySlot } from '../../../types/TOIMEntitySlot';
import { TOIMOrderedListCommand } from './TOIMOrderedListCommand';
import { OIMIndexManualOrderedArrayBased } from './OIMIndexManualOrderedArrayBased';

/**
 * Slot-first ordered-list command stream.
 *
 * Use this when you already have slots and want incremental commands for an
 * imperative renderer. For PK writes bound to a collection, use
 * `OIMCollectionOrderedListCommandStream`.
 */
export class OIMOrderedListCommandStream<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TEntity extends object = object,
> {
    public readonly commandsEventEmitter: OIMUpdateEventEmitter<TKey>;
    private readonly unsubscribeAfterFlush: () => void;
    private readonly unsubscribeFromIndexEmitter: () => void;
    protected isInWrite = false;

    private readonly commandsByKey = new Map<
        TKey,
        TOIMOrderedListCommand<TPk, TEntity>[]
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

        // If the index is mutated directly, emit a full `set` command to resync.
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

    public getEntitiesByKey(key: TKey): TEntity[] {
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
            this.appendCommand(key, {
                type: 'insert',
                pk: slot.pk,
                slot,
                index,
            });
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
                pk: slot.pk,
                slot,
                index: safeIndex,
            });
        });
    }

    public removeAt(key: TKey, index: number): void {
        this.withWrite(() => {
            const slot = this.index.removeAt(key, index);
            if (slot === undefined) return;
            this.appendCommand(key, {
                type: 'remove',
                pk: slot.pk,
                slot: slot as TOIMEntitySlot<TEntity, TPk>,
                index,
            });
        });
    }

    public move(key: TKey, fromIndex: number, toIndex: number): void {
        this.withWrite(() => {
            const slot = this.index.move(key, fromIndex, toIndex);
            if (slot === undefined) return;
            this.appendCommand(key, {
                type: 'move',
                pk: slot.pk,
                slot: slot as TOIMEntitySlot<TEntity, TPk>,
                fromIndex,
                toIndex,
            });
        });
    }

    public setSlots(
        key: TKey,
        slots: readonly TOIMEntitySlot<TEntity, TPk>[]
    ): void {
        this.withWrite(() => {
            this.index.resetSlots(key, slots);
            this.appendSetCommand(key, slots);
        });
    }

    public getBufferedCommands(
        key: TKey
    ): readonly TOIMOrderedListCommand<TPk, TEntity>[] {
        return this.commandsByKey.get(key) ?? [];
    }

    public consumeCommands(key: TKey): TOIMOrderedListCommand<TPk, TEntity>[] {
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
            this.appendSetCommand(key, this.getSlotsByKey(key));
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
        cmd: TOIMOrderedListCommand<TPk, TEntity>
    ): void {
        let cmds = this.commandsByKey.get(key);
        if (!cmds) {
            cmds = [];
            this.commandsByKey.set(key, cmds);
        }

        if (cmd.type === 'set') {
            cmds.length = 0;
            cmds.push(cmd);
        } else if (cmds.length > 0 && cmds[0].type === 'set') {
            const slots = this.getSlotsByKey(key);
            cmds[0] = this.createSetCommand(slots);
        } else {
            cmds.push(cmd);
        }

        this.commandsEventEmitter.markUpdatedKeys([key]);
    }

    protected appendSetCommand(
        key: TKey,
        slots: readonly TOIMEntitySlot<TEntity, TPk>[]
    ): void {
        this.appendCommand(key, this.createSetCommand(slots));
    }

    protected createSetCommand(
        slots: readonly TOIMEntitySlot<TEntity, TPk>[]
    ): TOIMOrderedListCommand<TPk, TEntity> {
        return {
            type: 'set',
            pks: slots.map(slot => slot.pk),
            slots,
        };
    }
}
