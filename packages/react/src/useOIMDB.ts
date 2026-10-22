import { useContext } from 'react';
import type { OIMDB } from '@oimdb/core';
import { OIMDBContext } from './OIMDBContext';

export function useOIMDB(): OIMDB {
    const db = useContext(OIMDBContext);
    if (db === undefined) {
        throw new Error(
            'useOIMDB: no <OIMDBProvider db={...}> above this component. The hooks that build a computed ' +
                'for the component take the database from it.',
        );
    }
    return db;
}
