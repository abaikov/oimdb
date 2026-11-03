import type { TOIMPersistIndexedDbPrimaryKey } from '../types/TOIMPersistIndexedDbPrimaryKey';

const OIM_OBJECT_ADDRESS_PREFIX = 'oimdb:object:';

const isOIMPlainRecord = (key: TOIMPersistIndexedDbPrimaryKey): key is Readonly<Record<string, unknown>> => {
    if (key === null || typeof key !== 'object') return false;
    const prototype = Object.getPrototypeOf(key) as unknown;
    return prototype === Object.prototype || prototype === null;
};

const collectOIMPropertyNames = (value: unknown, propertyNames: Set<string>, seenObjects: WeakSet<object>): void => {
    if (value === null || typeof value !== 'object') return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) collectOIMPropertyNames(value[i], propertyNames, seenObjects);
        return;
    }
    const record = value as Record<string, unknown>;
    const ownPropertyNames = Object.keys(record);
    for (let i = 0; i < ownPropertyNames.length; i++) {
        propertyNames.add(ownPropertyNames[i]);
        collectOIMPropertyNames(record[ownPropertyNames[i]], propertyNames, seenObjects);
    }
};

export function normalizeOIMIndexedDbPrimaryKey(primaryKey: TOIMPersistIndexedDbPrimaryKey): IDBValidKey {
    if (!isOIMPlainRecord(primaryKey)) return primaryKey as IDBValidKey;
    const propertyNames = new Set<string>();
    collectOIMPropertyNames(primaryKey, propertyNames, new WeakSet<object>());
    return `${OIM_OBJECT_ADDRESS_PREFIX}${JSON.stringify(primaryKey, Array.from(propertyNames).sort())}`;
}
