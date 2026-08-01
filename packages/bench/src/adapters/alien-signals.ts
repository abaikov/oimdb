import { computed as alienComputed, effect as alienEffect, signal as alienSignal } from 'alien-signals';
import type { TAdapter, TUser } from '../harness/types';

/**
 * alien-signals — a signal library, not a store.
 *
 * It is here as a REFERENCE for the reactive-graph rows only: it shows what a dependency graph costs
 * with no database underneath, which is the floor every store in this comparison is building on top
 * of. Everything about storage, indexing, querying or per-entity subscription is absent because the
 * library does not have it — not because the scenario was skipped.
 * https://github.com/stackblitz/alien-signals
 */
/** A signal is a function: call it to read, call it with a value to write. */
const read = <T>(s: (v?: T) => T): T => s();
const write = <T>(s: (v?: T) => T, next: T): void => {
    s(next);
};

export const alienSignalsAdapter: TAdapter = {
    name: 'alien-signals',
    version: '3.2.1',
    docs: 'https://github.com/stackblitz/alien-signals',

    fanOutRecompute: (users, derived, updates) => {
        const signals = users
            .slice(0, derived)
            .map(u => alienSignal<TUser>(u));
        let recomputes = 0;
        let wakeups = 0;
        for (const source of signals) {
            const name = alienComputed(() => {
                recomputes++;
                return read(source).name;
            });
            alienEffect(() => {
                read(name);
                wakeups++;
            });
        }
        const target = signals[0];
        let n = 0;
        return {
            setup: () => {
                write(target, { ...read(target), name: `settle${n++}` });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    write(target, { ...read(target), name: `n${n++}` });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    diamondGlitch: (users, updates) => {
        const source = alienSignal<TUser>(users[0]);
        const a = alienComputed(() => read(source).name.length);
        const b = alienComputed(() => read(source).name.toUpperCase());
        let recomputes = 0;
        const c = alienComputed(() => {
            recomputes++;
            return `${read(a)}:${read(b)}`;
        });
        let wakeups = 0;
        alienEffect(() => {
            read(c);
            wakeups++;
        });
        let n = 0;
        return {
            setup: () => {
                write(source, { ...read(source), name: `settle-${n++}` });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    write(source, { ...read(source), name: `name-${n++}` });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    deepGraphGlitch: (users, depth, updates) => {
        const source = alienSignal<TUser>(users[0]);
        const chain: (() => string)[] = [];
        const first = alienComputed(() => read(source).name);
        chain.push(() => read(first));
        for (let level = 1; level < depth; level++) {
            const previous = chain[level - 1];
            const node = alienComputed(() => previous());
            chain.push(() => read(node));
        }
        const tail = chain[depth - 1];
        const faces = chain.filter((_, level) => level % 2 === 1);
        let recomputes = 0;
        let inconsistencies = 0;
        const final = alienComputed(() => {
            recomputes++;
            const direct = read(source).name;
            for (const face of faces) {
                if (face() !== direct) inconsistencies++;
            }
            const deep = tail();
            if (direct !== deep) inconsistencies++;
            return `${direct}|${deep}`;
        });
        let wakeups = 0;
        alienEffect(() => {
            read(final);
            wakeups++;
        });
        let n = 0;
        return {
            setup: () => {
                write(source, { ...read(source), name: `settle-${n++}` });
                recomputes = 0;
                wakeups = 0;
                inconsistencies = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    write(source, { ...read(source), name: `name-${n++}` });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
            inconsistencies: () => inconsistencies,
        };
    },

    /** The signal holds the whole user, so a write to `active` re-runs the computed over `name`. */
    unrelatedFieldWakeups: (users, updates) => {
        const source = alienSignal<TUser>(users[0]);
        let recomputes = 0;
        const name = alienComputed(() => {
            recomputes++;
            return read(source).name;
        });
        let wakeups = 0;
        alienEffect(() => {
            read(name);
            wakeups++;
        });
        let flag = false;
        return {
            setup: () => {
                flag = !flag;
                write(source, { ...read(source), active: flag });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    flag = !flag;
                    write(source, { ...read(source), active: flag });
                }
            },
            verify: () => true,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    computedChain: (users, updates) => {
        const source = alienSignal<TUser>(users[users.length >> 1]);
        const level1 = alienComputed(() => read(source).name);
        const level2 = alienComputed(() => read(level1).toUpperCase());
        const level3 = alienComputed(() => `${read(level2)}!`);
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    write(source, { ...read(source), name: `n${n++}` });
                    sink = read(level3);
                }
            },
            verify: () => sink.endsWith('!'),
        };
    },

    // Everything else is absent: a signal library has no store, no index, no query, no per-entity
    // subscription and no bulk write. See the note at the top of this file.
};
