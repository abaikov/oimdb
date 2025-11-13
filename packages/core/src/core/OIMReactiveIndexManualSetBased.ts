import { OIMReactiveIndexSetBased } from '../abstract/OIMReactiveIndexSetBased';
import { OIMIndexManualSetBased } from './OIMIndexManualSetBased';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';

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
        opts?: { index: OIMIndexManualSetBased<TKey, TPk> }
    ) {
        super(queue, opts);
    }

    protected createDefaultIndex(): OIMIndexManualSetBased<TKey, TPk> {
        return new OIMIndexManualSetBased<TKey, TPk>();
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

