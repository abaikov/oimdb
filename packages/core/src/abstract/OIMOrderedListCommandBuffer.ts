import { TOIMKey } from '../types/TOIMKey';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMUpdateEventEmitter } from '../core/OIMUpdateEventEmitter';
import { EOIMEventQueueEventType } from '../enums/EOIMEventQueueEventType';
import { IOIMOrderedListCommandSource } from '../interfaces/IOIMOrderedListCommandSource';
import { TOIMOrderedListCommand } from '../modules/wrapper/index/TOIMOrderedListCommand';

/**
 * Abstract base for position-addressed ordered-list command streams.
 *
 * Holds the machinery that is independent of what *produces* the commands:
 * per-key command buffering with reset-coalescing, `after_flush` delivery via
 * {@link commandsEventEmitter}, and the pull-based consume/subscribe surface
 * ({@link IOIMOrderedListCommandSource}). The driver lives in the subclass:
 * `OIMOrderedListCommandStream` appends commands from imperative writers;
 * `OIMOrderedListCommandStreamDiffDriven` appends them by diffing a reactive
 * index.
 *
 * {@link getItemsByKey} is abstract — each driver reads the current order from
 * its own backing (a manual ordered index, or an external reactive index). It is
 * consulted only on the cold reset-coalescing path, so it stays off the hot
 * append path.
 */
export abstract class OIMOrderedListCommandBuffer<TKey extends TOIMKey, TItem>
    implements IOIMOrderedListCommandSource<TKey, TItem>
{
    public readonly commandsEventEmitter: OIMUpdateEventEmitter<TKey>;
    private readonly unsubscribeAfterFlush: () => void;

    protected readonly commandsByKey = new Map<
        TKey,
        TOIMOrderedListCommand<TItem>[]
    >();
    // Keys whose buffered leading `reset` is stale: an edit after the reset
    // should be folded into it, but we defer the (O(list-size)) rebuild to the
    // next read instead of redoing it on every subsequent edit in the batch.
    private readonly staleResetKeys = new Set<TKey>();

    constructor(queue: OIMEventQueue) {
        // Delivery is `after_flush`: writers/diffs buffer during the flush, the
        // whole batch is delivered once the queue settles. The emitter registers
        // its AFTER_FLUSH listener here, before `onAfterFlush` below, so delivery
        // runs before the buffer is cleared.
        this.commandsEventEmitter = new OIMUpdateEventEmitter<TKey>(
            queue,
            'after_flush'
        );
        this.unsubscribeAfterFlush = queue.emitter.on(
            EOIMEventQueueEventType.AFTER_FLUSH,
            this.onAfterFlush
        );
    }

    /** Current ordered items for `key` (the driver's backing order). */
    public abstract getItemsByKey(key: TKey): readonly TItem[];

    public subscribeCommands(key: TKey, handler: () => void): () => void {
        return this.commandsEventEmitter.subscribeOnKey(key, handler);
    }

    public getBufferedCommands(
        key: TKey
    ): readonly TOIMOrderedListCommand<TItem>[] {
        this.materializeStaleReset(key);
        return this.commandsByKey.get(key) ?? [];
    }

    public consumeCommands(key: TKey): TOIMOrderedListCommand<TItem>[] {
        this.materializeStaleReset(key);
        const cmds = this.commandsByKey.get(key);
        if (!cmds || cmds.length === 0) return [];
        return cmds.slice();
    }

    public destroy(): void {
        this.commandsEventEmitter.destroy();
        this.unsubscribeAfterFlush();
        this.commandsByKey.clear();
        this.staleResetKeys.clear();
    }

    private readonly onAfterFlush = () => {
        this.commandsByKey.clear();
        this.staleResetKeys.clear();
    };

    /**
     * Rebuild a deferred leading `reset` from the current order, once, at read
     * time. All the post-reset edits that were folded in are already reflected
     * in the driver's backing order, so a single rebuild here is equivalent to
     * having recomputed the reset on each of those edits.
     */
    private materializeStaleReset(key: TKey): void {
        if (!this.staleResetKeys.delete(key)) return;
        const cmds = this.commandsByKey.get(key);
        if (cmds && cmds.length > 0 && cmds[0].type === 'reset') {
            cmds[0] = this.createResetCommand(this.getItemsByKey(key));
        }
    }

    protected appendCommand(
        key: TKey,
        cmd: TOIMOrderedListCommand<TItem>
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
            // A fresh reset is authoritative — drop any pending rebuild.
            this.staleResetKeys.delete(key);
        } else if (cmds.length > 0 && cmds[0].type === 'reset') {
            // Once the batch starts with a reset, later structural edits fold
            // into it. Mark it stale and rebuild once, lazily, on the next read
            // (see materializeStaleReset) rather than rebuilding per edit.
            this.staleResetKeys.add(key);
        } else {
            cmds.push(cmd);
        }

        this.commandsEventEmitter.markUpdatedKeys([key]);
    }

    protected appendResetCommand(
        key: TKey,
        items: readonly TItem[]
    ): void {
        this.appendCommand(key, this.createResetCommand(items));
    }

    protected createResetCommand(
        items: readonly TItem[]
    ): TOIMOrderedListCommand<TItem> {
        return { type: 'reset', items };
    }
}
