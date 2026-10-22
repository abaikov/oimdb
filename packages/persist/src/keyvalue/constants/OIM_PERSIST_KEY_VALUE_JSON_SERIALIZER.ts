import type { TOIMPersistKeyValueSerializer } from '../types/TOIMPersistKeyValueSerializer';

export const OIM_PERSIST_KEY_VALUE_JSON_SERIALIZER: TOIMPersistKeyValueSerializer = {
    serialize: value => JSON.stringify(value),
    deserialize: item => JSON.parse(item) as unknown,
};
