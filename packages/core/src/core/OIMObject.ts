import { OIMObjectStore } from '../abstract/OIMObjectStore';
import { OIMObjectStoreRecordDriven } from './OIMObjectStoreRecordDriven';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMObjectEventType } from '../enums/EOIMObjectEventType';
import { TOIMUpdatePayload } from '../types/TOIMUpdatePayload';
import { TOIMObjectOptions } from '../types/TOIMObjectOptions';

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
        this.onUpdatedKey(key);
    }

    public merge(draft: Partial<Record<TKey, TValue>>): void {
        this.store.merge(draft);
        this.onUpdatedKeys(Object.keys(draft) as unknown as TKey[]);
    }

    public delete(key: TKey): void {
        this.store.delete(key);
        this.onUpdatedKey(key);
    }

    public get(key: TKey): TValue | undefined {
        return this.store.get(key);
    }

    public getAll(): Record<TKey, TValue> {
        return this.store.getAll();
    }

    public clear(): void {
        this.store.clear();
        this.onUpdatedKeys([]);
    }

    /**
     * Write fan-out hooks. Split single-key vs multi-key so a reactive subclass
     * can mark its keyed emitter on the hot single-property path without
     * allocating a `{ keys: [key] }` payload. The base only fires the general
     * UPDATE event, and only when something is actually subscribed to it — so an
     * unobserved write skips the payload allocation entirely.
     */
    protected onUpdatedKey(key: TKey): void {
        if (this.emitter.hasHandlers(EOIMObjectEventType.UPDATE)) {
            this.emitter.emit(EOIMObjectEventType.UPDATE, { keys: [key] });
        }
    }

    protected onUpdatedKeys(keys: TKey[]): void {
        if (this.emitter.hasHandlers(EOIMObjectEventType.UPDATE)) {
            this.emitter.emit(EOIMObjectEventType.UPDATE, { keys });
        }
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
