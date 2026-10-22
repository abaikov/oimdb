import * as React from 'react';
import type { OIMDB } from '@oimdb/core';
import { OIMDBContext } from './OIMDBContext';

export function OIMDBProvider({ db, children }: { db: OIMDB; children: React.ReactNode }): React.ReactElement {
    return <OIMDBContext.Provider value={db}>{children}</OIMDBContext.Provider>;
}
