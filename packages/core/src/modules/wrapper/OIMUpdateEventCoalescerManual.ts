import { OIMUpdateEventCoalescer } from '../../core/OIMUpdateEventCoalescer';
import { TOIMPk } from '../../type/TOIMPk';

/**
 * Manual coalescer: you mark keys as updated explicitly.
 *
 * Useful for wrappers that maintain their own "derived" state (e.g. change-sets, command streams)
 * and want to reuse `OIMUpdateEventEmitter` batching/reentrancy semantics without piggybacking
 * on a collection/index/object emitter payload.
 */
export class OIMUpdateEventCoalescerManual<
    TKey extends TOIMPk,
> extends OIMUpdateEventCoalescer<TKey> {
    public markUpdatedKeys(keys: readonly TKey[]): void {
        if (keys.length === 0) return;
        this.addUpdatedKeys(keys);
    }

    public destroy(): void {
        this.emitter.offAll();
        this.updatedKeysIndex.destroy();
        this.flushingUpdatedKeysIndex.destroy();
    }
}
