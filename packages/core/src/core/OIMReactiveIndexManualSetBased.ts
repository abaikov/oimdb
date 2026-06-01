import { OIMReactiveIndexSetBased } from '../abstract/OIMReactiveIndexSetBased';
import { OIMIndexManualSetBased } from './OIMIndexManualSetBased';
import { TOIMPk } from '../type/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { TOIMIndexComparator } from '../type/TOIMIndexComparator';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotResolver,
} from '../type/TOIMEntitySlot';

class OIMIndexManualSetBasedReactive<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexManualSetBased<TKey, TPk> {
    constructor(
        private readonly updateEmitter: OIMUpdateEventEmitter<TKey>,
        opts?: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreSetBased<TKey, TPk>;
            resolveSlot?: TOIMEntitySlotResolver<TPk>;
        }
    ) {
        super(opts);
    }

    protected override emitUpdate(keys: TKey[]): void {
        this.updateEmitter.markUpdatedKeys(keys);
    }

    protected override emitUpdateOne(key: TKey): void {
        this.updateEmitter.markUpdatedKey(key);
    }
}

export class OIMReactiveIndexManualSetBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMReactiveIndexSetBased<
    TKey,
    TPk,
    OIMIndexManualSetBased<TKey, TPk>
> {
    constructor(
        queue: OIMEventQueue,
        opts?: {
            indexOptions?: {
                comparePks?: TOIMIndexComparator<TPk>;
                store?: OIMIndexStoreSetBased<TKey, TPk>;
                resolveSlot?: TOIMEntitySlotResolver<TPk>;
            };
        }
    ) {
        super(queue, updateEmitter => {
            return new OIMIndexManualSetBasedReactive<TKey, TPk>(
                updateEmitter,
                opts?.indexOptions
            );
        });
    }

    public setPks(key: TKey, pks: TPk[]): void {
        this.index.setPks(key, pks);
    }

    public setSlots(
        key: TKey,
        slots: Iterable<TOIMAnyEntitySlot<TPk>>
    ): void {
        this.index.setSlots(key, slots);
    }

    public addPks(key: TKey, pks: readonly TPk[]): void {
        this.index.addPks(key, pks);
    }

    public removePks(key: TKey, pks: readonly TPk[]): void {
        this.index.removePks(key, pks);
    }

    public clear(key?: TKey): void {
        this.index.clear(key);
    }
}
