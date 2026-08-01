import { computed as signalComputed, effect as signalEffect, signal } from '@preact/signals-core';
import type { TAdapter, TUser } from '../harness/types';

/**
 * @preact/signals-core — a signal library, not a store.
 *
 * It is here as a REFERENCE for the reactive-graph rows only: it shows what a dependency graph costs
 * with no database underneath, which is the floor every store in this comparison is building on top
 * of. Everything about storage, indexing, querying or per-entity subscription is absent because the
 * library does not have it — not because the scenario was skipped.
 * https://github.com/preactjs/signals
 */
/** `.value` is both the read and the write; these keep the shared template readable. */
const read = <T>(s: { value: T }): T => s.value;
const write = <T>(s: { value: T }, next: T): void => {
    s.value = next;
};

export const preactSignalsAdapter: TAdapter = {
    name: '@preact/signals-core',
    version: '1.14.4',
    docs: 'https://github.com/preactjs/signals',

    fanOutRecompute: (users, derived, updates) => {
        const signals = users
            .slice(0, derived)
            .map(u => signal<TUser>(u));
        let recomputes = 0;
        let wakeups = 0;
        for (const source of signals) {
            const name = signalComputed(() => {
                recomputes++;
                return read(source).name;
            });
            signalEffect(() => {
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
        const source = signal<TUser>(users[0]);
        const a = signalComputed(() => read(source).name.length);
        const b = signalComputed(() => read(source).name.toUpperCase());
        let recomputes = 0;
        const c = signalComputed(() => {
            recomputes++;
            return `${read(a)}:${read(b)}`;
        });
        let wakeups = 0;
        signalEffect(() => {
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
        const source = signal<TUser>(users[0]);
        const chain: (() => string)[] = [];
        const first = signalComputed(() => read(source).name);
        chain.push(() => read(first));
        for (let level = 1; level < depth; level++) {
            const previous = chain[level - 1];
            const node = signalComputed(() => previous());
            chain.push(() => read(node));
        }
        const tail = chain[depth - 1];
        const faces = chain.filter((_, level) => level % 2 === 1);
        let recomputes = 0;
        let inconsistencies = 0;
        const final = signalComputed(() => {
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
        signalEffect(() => {
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
        const source = signal<TUser>(users[0]);
        let recomputes = 0;
        const name = signalComputed(() => {
            recomputes++;
            return read(source).name;
        });
        let wakeups = 0;
        signalEffect(() => {
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
        const source = signal<TUser>(users[users.length >> 1]);
        const level1 = signalComputed(() => read(source).name);
        const level2 = signalComputed(() => read(level1).toUpperCase());
        const level3 = signalComputed(() => `${read(level2)}!`);
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
