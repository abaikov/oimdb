import type { TExcludedLibrary } from '../harness/types';

// NOT IN THE COMPARISON: a headless VIEW layer that owns neither the data nor a
// change signal for it. `packages/bench/PARTICIPANTS.md`.
export const tanstackTableExclusion: TExcludedLibrary = {
    name: 'tanstack-table',
    version: '9.3.1',
    docs: 'https://tanstack.com/table/latest/docs/guide/data',
    reason:
        'a headless view layer: it never holds the rows (`data` stays the caller\'s array) and has ' +
        'no change signal for them — `onStateChange` reports table state, never data. Neither half ' +
        'of the rule, so there is no store here to compare.',
};
