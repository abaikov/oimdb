import { exoContextToken } from '@exodra/context';
import type { OIMExodraPlugin } from './OIMExodraPlugin';

export const OIM_EXODRA_PLUGIN_CONTEXT_TOKEN = exoContextToken<OIMExodraPlugin>('exodraPlugin');
