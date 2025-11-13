import { OIMReactiveIndexArrayBased } from '../abstract/OIMReactiveIndexArrayBased';
import { OIMIndexManualArrayBased } from './OIMIndexManualArrayBased';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';

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
        opts?: { index: OIMIndexManualArrayBased<TKey, TPk> }
    ) {
        super(queue, opts);
    }

    protected createDefaultIndex(): OIMIndexManualArrayBased<TKey, TPk> {
        return new OIMIndexManualArrayBased<TKey, TPk>();
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

