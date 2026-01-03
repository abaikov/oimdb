import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { OIMUpdateEventCoalescerManual } from '../OIMUpdateEventCoalescerManual';
import { TOIMPk } from '../../../type/TOIMPk';
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
 * - A future optimizer can collapse the command buffer into `reset(...)` if needed.
 */
export class OIMOrderedListIndexCommandStreamWrapper<
    TKey extends TOIMPk,
    TItemKey extends TOIMPk,
> {
    public readonly commandsEventEmitter: OIMUpdateEventEmitter<TKey>;

    private readonly coalescer: OIMUpdateEventCoalescerManual<TKey>;
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
        this.coalescer = new OIMUpdateEventCoalescerManual<TKey>();
        this.commandsEventEmitter = new OIMUpdateEventEmitter<TKey>({
            coalescer: this.coalescer,
            queue,
        });
        this.index =
            index ?? new OIMIndexManualOrderedArrayBased<TKey, TItemKey>();
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
        const index = this.index.push(key, itemKey);
        this.appendCommand(key, { type: 'add', key: itemKey, index });
    }

    public removeAt(key: TKey, index: number): void {
        const itemKey = this.index.removeAt(key, index);
        if (itemKey === undefined) return;
        this.appendCommand(key, { type: 'remove', key: itemKey, index });
    }

    public move(key: TKey, fromIndex: number, toIndex: number): void {
        const itemKey = this.index.move(key, fromIndex, toIndex);
        if (itemKey === undefined) return;
        this.appendCommand(key, {
            type: 'move',
            key: itemKey,
            fromIndex,
            toIndex,
        });
    }

    public reset(key: TKey, keys: readonly TItemKey[]): void {
        this.index.reset(key, keys);
        this.appendCommand(key, { type: 'reset', keys });
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
        this.commandsByKey.delete(key);
        return cmds;
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
        this.coalescer.destroy();
        this.clear();
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
        cmds.push(cmd);
        this.coalescer.markUpdatedKeys([key]);
    }
}
