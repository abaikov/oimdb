import { createContext } from 'react';
import type { OIMDB } from '@oimdb/core';

export const OIMDBContext = createContext<OIMDB | undefined>(undefined);
