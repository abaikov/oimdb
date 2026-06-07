import { OIMReactiveIndexSetBased } from '../abstract/OIMReactiveIndexSetBased';
import { OIMIndexManualSetBased } from './OIMIndexManualSetBased';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

class OIMIndexManualSetBasedReactive<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexManualSetBased<TKey, TPk> {
    constructor(
        private readonly updateEmitter: IOIMKeyedUpdateEmitter<TKey>,
        opts?: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreSetBased<TKey, TPk>;
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

    public setSlots(
        key: TKey,
        slots: Iterable<TOIMAnyEntitySlot<TPk>>
    ): void {
        this.index.setSlots(key, slots);
    }

    public addSlots(
        key: TKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        this.index.addSlots(key, slots);
    }

    public removeSlots(
        key: TKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        this.index.removeSlots(key, slots);
    }

    public clear(key?: TKey): void {
        this.index.clear(key);
    }
}
