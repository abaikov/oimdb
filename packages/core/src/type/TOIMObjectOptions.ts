import { OIMObjectStore } from '../abstract/OIMObjectStore';

export type TOIMObjectOptions<TKey extends string, TValue> = {
    store?: OIMObjectStore<TKey, TValue>;
};


