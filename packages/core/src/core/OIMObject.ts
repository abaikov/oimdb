import { OIMObjectStore } from '../abstract/OIMObjectStore';
import { OIMObjectStoreRecordDriven } from './OIMObjectStoreRecordDriven';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMObjectEventType } from '../enum/EOIMObjectEventType';
import { TOIMUpdatePayload } from '../type/TOIMUpdatePayload';
import { TOIMObjectOptions } from '../type/TOIMObjectOptions';

/** It's like a store - but with event emitter */
export class OIMObject<TKey extends string, TValue> {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMObjectEventType.UPDATE]: TOIMUpdatePayload<TKey>;
    }>();

    protected readonly store: OIMObjectStore<TKey, TValue>;

    constructor(opts?: TOIMObjectOptions<TKey, TValue>) {
        this.store =
            opts?.store ?? new OIMObjectStoreRecordDriven<TKey, TValue>();
    }

    public setProperty(key: TKey, value: TValue): void {
        this.store.setProperty(key, value);
        this.emitter.emit(EOIMObjectEventType.UPDATE, { keys: [key] });
    }

    public merge(draft: Partial<Record<TKey, TValue>>): void {
        this.store.merge(draft);
        this.emitter.emit(EOIMObjectEventType.UPDATE, {
            keys: Object.keys(draft) as unknown as TKey[],
        });
    }

    public delete(key: TKey): void {
        this.store.delete(key);
        this.emitter.emit(EOIMObjectEventType.UPDATE, { keys: [key] });
    }

    public get(key: TKey): TValue | undefined {
        return this.store.get(key);
    }

    public getAll(): Record<TKey, TValue> {
        return this.store.getAll();
    }

    public clear(): void {
        this.store.clear();
        this.emitter.emit(EOIMObjectEventType.UPDATE, { keys: [] });
    }

    public count(): number {
        return this.store.count();
    }

    public keys(): TKey[] {
        return this.store.keys();
    }

    public values(): TValue[] {
        return this.store.values();
    }

    public entries(): [TKey, TValue][] {
        return this.store.entries();
    }

    public destroy(): void {
        this.store.destroy();
        this.emitter.offAll();
    }
}
