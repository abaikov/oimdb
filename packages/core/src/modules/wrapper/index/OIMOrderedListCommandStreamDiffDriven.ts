import { TOIMKey } from '../../../types/TOIMKey';
import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { OIMIndexArrayBased } from '../../../abstract/OIMIndexArrayBased';
import { OIMReactiveIndexArrayBased } from '../../../abstract/OIMReactiveIndexArrayBased';
import { OIMOrderedListCommandBuffer } from '../../../abstract/OIMOrderedListCommandBuffer';
import { TOIMEntitySlot } from '../../../types/TOIMEntitySlot';
import { TOIMOrderedListDiffOptions } from '../../../types/TOIMOrderedListDiffOptions';
import { TOIMPk } from '../../../types/TOIMPk';
import { diffOrderedListByPk } from './diffOrderedListByPk';

/**
 * Ordered-list command stream driven by an existing reactive **array-based**
 * index (derived or manual). Instead of imperative writers, it diffs the
 * previous per-key order against the new one on every index change and emits the
 * position-addressed commands that transform one into the other — so a
 * collection change becomes `insert` / `move` / `remove` (or a `reset`) that an
 * imperative renderer can apply, moving nodes instead of rebuilding them.
 *
 * It rides the index's batching: the index delivers its coalesced per-key change
 * during the queue flush; this stream diffs there and buffers commands, which
 * the shared {@link OIMOrderedListCommandBuffer} delivers at `AFTER_FLUSH` — the
 * same timing contract as the writer stream.
 *
 * Wiring to the index for a key is lazy (first `subscribeCommands` or
 * `getItemsByKey`) and lives until `destroy()`. The output is an
 * `IOIMOrderedListCommandSource`, so it consumes exactly like the writer stream
 * and composes with `createOIMOrderedListMappedCommandStream`.
 */
export class OIMOrderedListCommandStreamDiffDriven<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TEntity extends object = object,
    TIndex extends OIMIndexArrayBased<TKey, TPk> = OIMIndexArrayBased<
        TKey,
        TPk
    >,
> extends OIMOrderedListCommandBuffer<TKey, TOIMEntitySlot<TEntity, TPk>> {
    private readonly index: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>;
    private readonly resetThreshold: number;
    private readonly prevByKey = new Map<
        TKey,
        TOIMEntitySlot<TEntity, TPk>[]
    >();
    private readonly indexUnsubscribeByKey = new Map<TKey, () => void>();

    constructor(
        queue: OIMEventQueue,
        index: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
        opts?: TOIMOrderedListDiffOptions
    ) {
        super(queue);
        this.index = index;
        this.resetThreshold = opts?.resetThreshold ?? 0;
    }

    public getItemsByKey(
        key: TKey
    ): readonly TOIMEntitySlot<TEntity, TPk>[] {
        this.ensureWired(key);
        return this.currentSlots(key);
    }

    public override subscribeCommands(
        key: TKey,
        handler: () => void
    ): () => void {
        this.ensureWired(key);
        return super.subscribeCommands(key, handler);
    }

    public override destroy(): void {
        this.indexUnsubscribeByKey.forEach(unsubscribe => unsubscribe());
        this.indexUnsubscribeByKey.clear();
        this.prevByKey.clear();
        super.destroy();
    }

    private currentSlots(
        key: TKey
    ): readonly TOIMEntitySlot<TEntity, TPk>[] {
        return this.index.getSlotsByKey(key) as readonly TOIMEntitySlot<
            TEntity,
            TPk
        >[];
    }

    /** Snapshot the current order and subscribe to the index once per key. */
    private ensureWired(key: TKey): void {
        if (this.indexUnsubscribeByKey.has(key)) return;
        this.prevByKey.set(key, this.currentSlots(key).slice());
        const unsubscribe = this.index.subscribeOnKey(key, () =>
            this.onIndexChange(key)
        );
        this.indexUnsubscribeByKey.set(key, unsubscribe);
    }

    private onIndexChange(key: TKey): void {
        const prev = this.prevByKey.get(key) ?? [];
        const next = this.currentSlots(key);
        this.emitDiff(key, prev, next);
        this.prevByKey.set(key, next.slice());
    }

    private emitDiff(
        key: TKey,
        prev: readonly TOIMEntitySlot<TEntity, TPk>[],
        next: readonly TOIMEntitySlot<TEntity, TPk>[]
    ): void {
        // Order unchanged (same pks in the same positions) → nothing to emit,
        // even if the index re-fired (e.g. a conservative compareEntities re-sort
        // that landed on the same order).
        if (sameOrderByPk(prev, next)) return;

        const commons = countCommonPks(prev, next);
        const larger = Math.max(prev.length, next.length);
        const wholeChange =
            prev.length === 0 ||
            next.length === 0 ||
            commons === 0 ||
            (this.resetThreshold > 0 && commons / larger < this.resetThreshold);

        if (wholeChange) {
            this.appendResetCommand(key, next);
            return;
        }

        const commands = diffOrderedListByPk(prev, next);
        for (let i = 0; i < commands.length; i++) {
            this.appendCommand(key, commands[i]);
        }
    }
}

function sameOrderByPk<TPk extends TOIMKey, TItem extends { pk: TPk }>(
    a: readonly TItem[],
    b: readonly TItem[]
): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].pk !== b[i].pk) return false;
    }
    return true;
}

function countCommonPks<TPk extends TOIMKey, TItem extends { pk: TPk }>(
    prev: readonly TItem[],
    next: readonly TItem[]
): number {
    const prevPks = new Set<TPk>();
    for (let i = 0; i < prev.length; i++) prevPks.add(prev[i].pk);
    let common = 0;
    for (let i = 0; i < next.length; i++) {
        if (prevPks.has(next[i].pk)) common++;
    }
    return common;
}
