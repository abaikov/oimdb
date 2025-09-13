import { OIMReactiveIndex } from '../abstract/OIMReactiveIndex';
import { OIMIndexManual } from './OIMIndexManual';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';

export class OIMReactiveIndexManual<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMReactiveIndex<TKey, TPk, OIMIndexManual<TKey, TPk>> {
    constructor(
        queue: OIMEventQueue,
        opts?: { index: OIMIndexManual<TKey, TPk> }
    ) {
        super(queue, opts);
    }

    protected createDefaultIndex(): OIMIndexManual<TKey, TPk> {
        return new OIMIndexManual<TKey, TPk>();
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
