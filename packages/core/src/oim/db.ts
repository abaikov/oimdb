import { OIMDB } from '@oimdb/core';

let defaultDB: OIMDB | undefined;

export function db(): OIMDB {
    return defaultDB ??= new OIMDB({ channelScheduler: (flush) => { queueMicrotask(flush); } });
}
