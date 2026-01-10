import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { EOIMEventQueueEventType } from '../../../enum/EOIMEventQueueEventType';
import { EOIMIndexEventType } from '../../../enum/EOIMIndexEventType';
import { TOIMPk } from '../../../type/TOIMPk';
import { TOIMIndexUpdatePayload } from '../../../type/TOIMIndexUpdatePayload';
import { TOIMOrderedListCommand } from './TOIMOrderedListCommand';
import { OIMIndexManualOrderedArrayBased } from './OIMIndexManualOrderedArrayBased';

/**
 * Ordered-list wrapper that stores arrays per key and emits a per-key command stream.
 *
 * This is designed for imperative renderers: instead of diffing the full list on each update,
 * you subscribe to `commandsEventEmitter` on a single list key and apply commands sequentially.
 *
 * Notes:
 * - Commands are buffered per key and delivered batched per queue flush.
 * - Order of commands is preserved.
 * - A future optimizer can collapse the command buffer into `set(...)` if needed.
 */
export class OIMOrderedListIndexCommandStreamWrapper<
    TKey extends TOIMPk,
    TItemKey extends TOIMPk,
> {
    public readonly commandsEventEmitter: OIMUpdateEventEmitter<TKey>;
    private readonly unsubscribeAfterFlush: () => void;
    private readonly unsubscribeFromIndexEmitter: () => void;
    private isInWrite = false;

    private readonly commandsByKey = new Map<
        TKey,
        TOIMOrderedListCommand<TItemKey>[]
    >();

    /** Underlying ordered index (source of truth for the list). */
    public readonly index: OIMIndexManualOrderedArrayBased<TKey, TItemKey>;

    constructor(
        queue: OIMEventQueue,
        index?: OIMIndexManualOrderedArrayBased<TKey, TItemKey>
    ) {
        this.commandsEventEmitter = new OIMUpdateEventEmitter<TKey>(
            queue,
            'after_flush'
        );
        this.index =
            index ?? new OIMIndexManualOrderedArrayBased<TKey, TItemKey>();

        // Flush-scoped buffer: commands are valid only within the same queue.flush().
        this.unsubscribeAfterFlush = queue.emitter.on(
            EOIMEventQueueEventType.AFTER_FLUSH,
            this.onAfterFlush
        );

        // DX: if index is mutated directly (bypassing this wrapper), emit a `set` command so
        // consumers can resync.
        this.unsubscribeFromIndexEmitter = this.index.emitter.on(
            EOIMIndexEventType.UPDATE,
            this.onIndexUpdate
        );
    }

    public getPksByKey(key: TKey): readonly TItemKey[] {
        return this.index.getPksByKey(key);
    }

    public hasKey(key: TKey): boolean {
        return this.index.hasKey(key);
    }

    public getKeys(): readonly TKey[] {
        return this.index.getKeys();
    }

    public push(key: TKey, itemKey: TItemKey): void {
        this.withWrite(() => {
            const index = this.index.push(key, itemKey);
            this.appendCommand(key, { type: 'add', key: itemKey, index });
        });
    }

    public removeAt(key: TKey, index: number): void {
        this.withWrite(() => {
            const itemKey = this.index.removeAt(key, index);
            if (itemKey === undefined) return;
            this.appendCommand(key, { type: 'remove', key: itemKey, index });
        });
    }

    public move(key: TKey, fromIndex: number, toIndex: number): void {
        this.withWrite(() => {
            const itemKey = this.index.move(key, fromIndex, toIndex);
            if (itemKey === undefined) return;
            this.appendCommand(key, {
                type: 'move',
                key: itemKey,
                fromIndex,
                toIndex,
            });
        });
    }

    public set(key: TKey, keys: readonly TItemKey[]): void {
        this.withWrite(() => {
            this.index.reset(key, keys);
            this.appendCommand(key, { type: 'set', keys });
        });
    }

    /**
     * Read-only peek at buffered commands without clearing them.
     */
    public getBufferedCommands(
        key: TKey
    ): readonly TOIMOrderedListCommand<TItemKey>[] {
        return this.commandsByKey.get(key) ?? [];
    }

    /**
     * Drain buffered commands for a key, preserving order.
     * Intended usage: call inside a `commandsEventEmitter.subscribeOnKey(key, ...)` handler.
     */
    public consumeCommands(key: TKey): TOIMOrderedListCommand<TItemKey>[] {
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
            const list = this.index.getPksByKey(key);
            // Use `set` to resync: best possible command when we didn't observe the mutation.
            this.appendCommand(key, { type: 'set', keys: Array.from(list) });
        }
    };

    private withWrite(fn: () => void): void {
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

    private appendCommand(
        key: TKey,
        cmd: TOIMOrderedListCommand<TItemKey>
    ): void {
        let cmds = this.commandsByKey.get(key);
        if (!cmds) {
            cmds = [];
            this.commandsByKey.set(key, cmds);
        }

        // Mini-optimization: once we have a `set` command for a key in this flush,
        // we can collapse all following commands into the latest `set`.
        if (cmd.type === 'set') {
            cmds.length = 0;
            cmds.push(cmd);
        } else if (cmds.length > 0 && cmds[0].type === 'set') {
            const setCmd = cmds[0];
            // Ensure the set payload reflects the latest list state.
            setCmd.keys = Array.from(this.index.getPksByKey(key));
        } else {
            cmds.push(cmd);
        }

        this.commandsEventEmitter.markUpdatedKeys([key]);
    }
}
