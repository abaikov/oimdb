import { useContext } from 'react';
import type { OIMDB } from '@oimdb/core';
import { OIMDBContext } from './OIMDBContext';

export function useOIMDB(): OIMDB {
    const db = useContext(OIMDBContext);
    if (db === undefined) {
        throw new Error(
            'useOIMDB: no <OIMDBProvider db={...}> above this component. useOIMSelector hands its select the ' +
                'database the provider holds, and subscribes on it.',
        );
    }
    return db;
}

useOIMDB.withTypes = <TDB extends OIMDB>(): (() => TDB) => useOIMDB as unknown as () => TDB;
