import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMOrderedListMapOptions } from '../../../types/TOIMOrderedListMapOptions';
import { IOIMOrderedListCommandSource } from '../../../interfaces/IOIMOrderedListCommandSource';
import { TOIMOrderedListCommand } from './TOIMOrderedListCommand';

/**
 * Projects an ordered-list command source element-wise, re-emitting the same
 * position-addressed commands with `item` replaced by the mapped value.
 *
 * It rides the source's batching: there is no queue and no independent
 * scheduling. On each source notification it pulls the source commands,
 * translates them (running `create` / `destroy` and updating a positional
 * mirror of the mapped elements), and notifies its own subscribers
 * synchronously — so the source's `after_flush` semantics carry through.
 *
 * Identity is positional: a `move` reorders the *same* mapped references in the
 * mirror, so the mapped element is preserved across moves and never recreated.
 * `create` runs on `insert` / `set` / `reset` / initial build; `destroy` on
 * `remove` / the replaced half of `set` / every element on `reset` / `destroy()`.
 *
 * Wiring to the source for a key is lazy (on first `subscribeCommands` or
 * `getItemsByKey`) and lives until `destroy()`; subscriber churn does not
 * create or tear down mapped elements.
 *
 * The output is itself an {@link IOIMOrderedListCommandSource}, so maps chain:
 * `source.map(...)` → `.map(...)`.
 */
export class OIMOrderedListMappedCommandStream<
    TKey extends TOIMPk,
    TOut,
    TIn,
> implements IOIMOrderedListCommandSource<TKey, TOut>
{
    private readonly source: IOIMOrderedListCommandSource<TKey, TIn>;
    private readonly create: (item: TIn) => TOut;
    private readonly destroyItem?: (mapped: TOut) => void;

    /** Per-key positional mirror of the mapped elements. */
    private readonly mirror = new Map<TKey, TOut[]>();
    /** Mapped commands produced for the current delivery, per key. */
    private readonly buffer = new Map<TKey, TOIMOrderedListCommand<TOut>[]>();
    private readonly subscribers = new Map<TKey, Set<() => void>>();
    private readonly sourceUnsubscribers = new Map<TKey, () => void>();

    constructor(
        source: IOIMOrderedListCommandSource<TKey, TIn>,
        opts: TOIMOrderedListMapOptions<TIn, TOut>
    ) {
        this.source = source;
        this.create = opts.create;
        this.destroyItem = opts.destroy;
    }

    public subscribeCommands(key: TKey, handler: () => void): () => void {
        this.ensureWired(key);

        let subs = this.subscribers.get(key);
        if (!subs) {
            subs = new Set();
            this.subscribers.set(key, subs);
        }
        subs.add(handler);

        return () => {
            const current = this.subscribers.get(key);
            if (!current) return;
            current.delete(handler);
            if (current.size === 0) this.subscribers.delete(key);
        };
    }

    public consumeCommands(key: TKey): TOIMOrderedListCommand<TOut>[] {
        const cmds = this.buffer.get(key);
        if (!cmds || cmds.length === 0) return [];
        return cmds.slice();
    }

    public getItemsByKey(key: TKey): readonly TOut[] {
        this.ensureWired(key);
        return this.mirror.get(key) ?? [];
    }

    /** Map this source again, chaining the projection. */
    public map<TNext>(
        opts: TOIMOrderedListMapOptions<TOut, TNext>
    ): OIMOrderedListMappedCommandStream<TKey, TNext, TOut> {
        return new OIMOrderedListMappedCommandStream<TKey, TNext, TOut>(
            this,
            opts
        );
    }

    public destroy(): void {
        this.sourceUnsubscribers.forEach(unsubscribe => unsubscribe());
        this.sourceUnsubscribers.clear();

        if (this.destroyItem) {
            this.mirror.forEach(items =>
                items.forEach(item => this.destroyItem!(item))
            );
        }

        this.mirror.clear();
        this.buffer.clear();
        this.subscribers.clear();
    }

    /** Build the initial mirror and subscribe to the source once per key. */
    private ensureWired(key: TKey): void {
        if (this.mirror.has(key)) return;

        const items = this.source.getItemsByKey(key);
        this.mirror.set(key, items.map(item => this.create(item)));

        const unsubscribe = this.source.subscribeCommands(key, () =>
            this.onSourceCommands(key)
        );
        this.sourceUnsubscribers.set(key, unsubscribe);
    }

    private onSourceCommands(key: TKey): void {
        const cmds = this.source.consumeCommands(key);
        if (cmds.length === 0) return;

        let mirror = this.mirror.get(key);
        if (!mirror) {
            mirror = [];
            this.mirror.set(key, mirror);
        }

        const out: TOIMOrderedListCommand<TOut>[] = [];

        for (let i = 0; i < cmds.length; i++) {
            const cmd = cmds[i];
            switch (cmd.type) {
                case 'insert': {
                    const mapped = this.create(cmd.item);
                    mirror.splice(cmd.index, 0, mapped);
                    out.push({
                        type: 'insert',
                        index: cmd.index,
                        item: mapped,
                    });
                    break;
                }
                case 'remove': {
                    const count = cmd.count ?? 1;
                    const removed = mirror.splice(cmd.index, count);
                    if (this.destroyItem) {
                        for (let r = 0; r < removed.length; r++) {
                            this.destroyItem(removed[r]);
                        }
                    }
                    out.push({ type: 'remove', index: cmd.index, count });
                    break;
                }
                case 'move': {
                    const count = cmd.count ?? 1;
                    const segment = mirror.splice(cmd.from, count);
                    mirror.splice(cmd.to, 0, ...segment);
                    out.push({
                        type: 'move',
                        from: cmd.from,
                        to: cmd.to,
                        count,
                    });
                    break;
                }
                case 'set': {
                    const mapped = this.create(cmd.item);
                    const replaced = mirror.splice(cmd.index, 1, mapped);
                    if (this.destroyItem && replaced.length > 0) {
                        this.destroyItem(replaced[0]);
                    }
                    out.push({ type: 'set', index: cmd.index, item: mapped });
                    break;
                }
                case 'reset': {
                    if (this.destroyItem) {
                        for (let r = 0; r < mirror.length; r++) {
                            this.destroyItem(mirror[r]);
                        }
                    }
                    const mapped = cmd.items.map(item => this.create(item));
                    mirror = mapped;
                    this.mirror.set(key, mapped);
                    out.push({ type: 'reset', items: mapped });
                    break;
                }
            }
        }

        this.buffer.set(key, out);
        try {
            const subs = this.subscribers.get(key);
            if (subs && subs.size > 0) {
                const snapshot = Array.from(subs);
                for (let s = 0; s < snapshot.length; s++) {
                    const handler = snapshot[s];
                    if (subs.has(handler)) handler();
                }
            }
        } finally {
            // Mirror the source: the buffer lives only for this synchronous
            // delivery, so consumers must drain it inside their handler.
            this.buffer.delete(key);
        }
    }
}
