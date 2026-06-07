import { OIMReactiveIndexArrayBased } from '../abstract/OIMReactiveIndexArrayBased';
import { OIMIndexManualArrayBased } from './OIMIndexManualArrayBased';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

class OIMIndexManualArrayBasedReactive<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexManualArrayBased<TKey, TPk> {
    constructor(
        private readonly updateEmitter: IOIMKeyedUpdateEmitter<TKey>,
        opts?: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreArrayBased<TKey, TPk>;
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

export class OIMReactiveIndexManualArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMReactiveIndexArrayBased<
    TKey,
    TPk,
    OIMIndexManualArrayBased<TKey, TPk>
> {
    constructor(
        queue: OIMEventQueue,
        opts?: {
            indexOptions?: {
                comparePks?: TOIMIndexComparator<TPk>;
                store?: OIMIndexStoreArrayBased<TKey, TPk>;
            };
        }
    ) {
        super(queue, updateEmitter => {
            return new OIMIndexManualArrayBasedReactive<TKey, TPk>(
                updateEmitter,
                opts?.indexOptions
            );
        });
    }

    public setSlots(key: TKey, slots: TOIMAnyEntitySlot<TPk>[]): void {
        this.index.setSlots(key, slots);
    }

    public appendSlots(
        key: TKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        this.index.appendSlots(key, slots);
    }

    public clear(key?: TKey): void {
        this.index.clear(key);
    }
}
