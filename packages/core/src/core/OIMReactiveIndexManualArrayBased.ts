import { OIMReactiveIndexArrayBased } from '../abstract/OIMReactiveIndexArrayBased';
import { OIMIndexManualArrayBased } from './OIMIndexManualArrayBased';
import { TOIMPk } from '../type/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { TOIMIndexComparator } from '../type/TOIMIndexComparator';

class OIMIndexManualArrayBasedReactive<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexManualArrayBased<TKey, TPk> {
    constructor(
        private readonly updateEmitter: OIMUpdateEventEmitter<TKey>,
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

    public setPks(key: TKey, pks: TPk[]): void {
        this.index.setPks(key, pks);
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
