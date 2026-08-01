import { atom, computed as nanoComputed } from 'nanostores';
import type { TAdapter, TComment, TUser } from '../harness/types';

/**
 * Recipe: nanostores' own docs. An `atom` per entity, `computed` for derived values, `listen` for
 * subscriptions. No batching primitive and no query layer — the library is deliberately tiny.
 * https://github.com/nanostores/nanostores#atoms
 *
 * Where a lookup needs an index, the index is ours; the comment says so.
 */
type TUserAtoms = Map<string, ReturnType<typeof atom<TUser>>>;

const buildUsers = (users: TUser[]): TUserAtoms => {
    const atoms: TUserAtoms = new Map();
    for (const u of users) atoms.set(u.id, atom(u));
    return atoms;
};

/**
 * A REACTIVE index: a `computed` over every entity atom, regrouped whenever one of them changes.
 *
 * A Map built once from the source array is a snapshot, not an index — it keeps answering the old
 * membership after an entity moves between teams, so measuring it against a maintained index is
 * meaningless. Correctness here costs an O(n) regroup on every write, which is what a library
 * without an index primitive actually pays.
 */
const reactiveIndex = <TKey extends string>(
    atoms: TUserAtoms,
    keyOf: (u: TUser) => TKey
) =>
    nanoComputed([...atoms.values()], (...list: TUser[]) => {
        const byKey = new Map<TKey, TUser[]>();
        for (const u of list) {
            const key = keyOf(u);
            const bucket = byKey.get(key);
            if (bucket) bucket.push(u);
            else byKey.set(key, [u]);
        }
        return byKey;
    });

export const nanostoresAdapter: TAdapter = {
    name: 'nanostores',
    version: '0.11.4',
    docs: 'https://github.com/nanostores/nanostores#atoms',

    /** TABLE — ⚠ HAND-ROLLED index; the sorted page per team is a `computed`. */
    taskTable: (users, interactions) => {
        const atoms = buildUsers(users);
        const byTeam = reactiveIndex(atoms, u => u.teamId);
        const sorted = new Map<string, { get: () => TUser[] }>();
        const rowsFor = (team: string) => {
            let memo = sorted.get(team);
            if (!memo) {
                memo = nanoComputed(byTeam, (index: Map<string, TUser[]>) =>
                    [...(index.get(team) ?? [])].sort((a, b) =>
                        a.name < b.name ? -1 : a.name > b.name ? 1 : 0
                    )
                );
                sorted.set(team, memo);
            }
            return memo;
        };
        let page: TUser[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    const offset = (i % 5) * 20;
                    page = rowsFor(`t${i % 50}`).get().slice(offset, offset + 20);
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /**
     * FEED PUSH — one `listen` per visible row. nanostores has no batching primitive, so the push
     * is N separate writes; the wakeup count is what matters here and it stays exact.
     */
    taskFeedPush: users => {
        const atoms = buildUsers(users);
        let woken = 0;
        for (const u of users.slice(0, 200)) atoms.get(u.id)!.listen(() => woken++);
        const pushed = [...users.slice(0, 12), ...users.slice(5_000, 5_988)];
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                for (const u of pushed) {
                    atoms.get(u.id)!.set({ ...atoms.get(u.id)!.get(), name: `push-${n}` });
                }
                n++;
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** DETAIL CARD — computeds for the comment list, its count and the caption. */
    taskDetailCard: (users, comments, updates) => {
        const atoms = buildUsers(users);
        const pk = users[0].id;
        const mine = comments.filter(c => c.userId === pk).map(c => atom(c));
        const rows = mine.length
            ? nanoComputed(mine, (...list: TComment[]) => list)
            : atom<TComment[]>([]);
        const count = nanoComputed(rows, (list: TComment[]) => list.length);
        const caption = nanoComputed(
            [atoms.get(pk)!, count],
            (user: TUser, total: number) => `${user.name} — ${total} comments`
        );
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    const a = atoms.get(pk)!;
                    a.set({ ...a.get(), name: `n${n++}` });
                    sink = caption.get();
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /** FACET SEARCH — ⚠ HAND-ROLLED composite index behind a `computed` per combination. */
    taskFacetSearch: (users, interactions) => {
        const atoms = buildUsers(users);
        const byFacet = reactiveIndex(atoms, u => `${u.teamId}:${u.active}` as const);
        const memos = new Map<string, { get: () => TUser[] }>();
        const facet = (key: string) => {
            let memo = memos.get(key);
            if (!memo) {
                memo = nanoComputed(
                    byFacet,
                    (index: Map<string, TUser[]>) => index.get(key) ?? []
                );
                memos.set(key, memo);
            }
            return memo;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    size = facet(`t${i % 10}:${Math.floor(i / 10) % 2 === 0}`).get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let atoms: TUserAtoms;
        return {
            setup: () => {
                atoms = new Map();
            },
            run: () => {
                for (const u of users) atoms.set(u.id, atom(u));
            },
            verify: () => atoms.size === users.length,
        };
    },

    readByPk: (users, reads) => {
        const atoms = buildUsers(users);
        const pk = users[users.length >> 1].id;
        let sink: TUser | undefined;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < reads; i++) sink = atoms.get(pk)!.get();
            },
            verify: () => sink?.id === pk,
        };
    },

    /** ⚠ HAND-ROLLED index. */
    queryColdByField: (users, queries) => {
        const atoms = buildUsers(users);
        const byTeam = reactiveIndex(atoms, u => u.teamId);
        const churn = atoms.get(users[0].id)!;
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    churn.set({ ...churn.get(), name: `n${n++}` });
                    size = (byTeam.get().get(`t${i % 50}`) ?? []).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * queryHotByField: intentionally absent.
     *
     * "Hot LIVE" means reading a standing index without a memo in front of it. Here the index IS a
     * derived value, so reading it is memoised by construction — there is no live read to measure,
     * and reporting the cached lookup under a live label compares this library's cache hit against
     * another's real work. The memoised number lives in `query cached`; the cost of keeping the
     * index correct lives in `query cold`.
     */


    /** CACHED: `computed` is the memo. */
    queryCachedByField: (users, queries) => {
        const atoms = buildUsers(users);
        const byTeam = reactiveIndex(atoms, u => u.teamId);
        const memos = new Map<string, { get: () => TUser[] }>();
        const rowsFor = (team: string) => {
            let memo = memos.get(team);
            if (!memo) {
                memo = nanoComputed(
                    byTeam,
                    (index: Map<string, TUser[]>) => index.get(team) ?? []
                );
                memos.set(team, memo);
            }
            return memo;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = rowsFor(`t${i % 50}`).get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** ⚠ HAND-ROLLED composite index behind a `computed`. */
    facetedFilter: (users, queries) => {
        const atoms = buildUsers(users);
        const byFacet = reactiveIndex(atoms, u => `${u.teamId}:${u.active}` as const);
        const memos = new Map<string, { get: () => TUser[] }>();
        const facet = (key: string) => {
            let memo = memos.get(key);
            if (!memo) {
                memo = nanoComputed(
                    byFacet,
                    (index: Map<string, TUser[]>) => index.get(key) ?? []
                );
                memos.set(key, memo);
            }
            return memo;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = facet(`t${i % 50}:${Math.floor(i / 50) % 2 === 0}`).get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** ⚠ HAND-ROLLED relation index. */
    relatedLookup: (users, comments, queries) => {
        const commentAtoms = new Map<string, ReturnType<typeof atom<TComment>>>();
        for (const c of comments) commentAtoms.set(c.id, atom(c));
        const idsByUser = new Map<string, string[]>();
        for (const c of comments) {
            const bucket = idsByUser.get(c.userId);
            if (bucket) bucket.push(c.id);
            else idsByUser.set(c.userId, [c.id]);
        }
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = (idsByUser.get(`u${i % users.length}`) ?? []).map(
                        id => commentAtoms.get(id)!.get()
                    ).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    computedChain: (users, updates) => {
        const atoms = buildUsers(users);
        const source = atoms.get(users[users.length >> 1].id)!;
        const level1 = nanoComputed(source, (u: TUser) => u.name);
        const level2 = nanoComputed(level1, (name: string) => name.toUpperCase());
        const level3 = nanoComputed(level2, (name: string) => `${name}!`);
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    source.set({ ...source.get(), name: `n${n++}` });
                    sink = level3.get();
                }
            },
            verify: () => sink.endsWith('!'),
        };
    },

    /** ⚠ HAND-ROLLED ordered list. */
    orderedInsert: (users, inserts) => {
        let atoms: TUserAtoms;
        let ids: string[];
        let size = 0;
        return {
            setup: () => {
                atoms = buildUsers(users);
                ids = users.filter(u => u.teamId === 't0').map(u => u.id);
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    const id = `new-${i}`;
                    atoms.set(
                        id,
                        atom<TUser>({
                            id,
                            teamId: 't0',
                            name: `name-0000${i % 10}`,
                            active: true,
                        })
                    );
                    ids.push(id);
                    size = ids
                        .map(k => atoms.get(k)!.get())
                        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    subscriptionChurn: (users, rows) => {
        const atoms = buildUsers(users);
        let stops: (() => void)[] = [];
        let offset = 0;
        const subscribe = (from: number) =>
            users.slice(from, from + rows).map(u => atoms.get(u.id)!.listen(() => undefined));
        return {
            setup: () => {
                for (const stop of stops) stop();
                stops = subscribe(0);
                offset = 0;
            },
            run: () => {
                for (const stop of stops) stop();
                offset = (offset + rows) % (users.length - rows);
                stops = subscribe(offset);
            },
            verify: () => stops.length === rows,
        };
    },

    pointUpdate: users => {
        const atoms = buildUsers(users);
        let woken = 0;
        for (const u of users) atoms.get(u.id)!.listen(() => woken++);
        const target = atoms.get(users[users.length >> 1].id)!;
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                target.set({ ...target.get(), name: `n${n++}` });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    effectDispatch: users => {
        const atoms = buildUsers(users);
        let ran = 0;
        for (const u of users) atoms.get(u.id)!.subscribe(() => ran++);
        const target = atoms.get(users[users.length >> 1].id)!;
        let n = 0;
        return {
            setup: () => {
                ran = 0;
            },
            run: () => {
                target.set({ ...target.get(), name: `n${n++}` });
            },
            verify: () => ran > 0,
            ran: () => ran,
        };
    },

    /** nanostores has no batching primitive: N writes are N notifications, by design. */
    batchUpdate: users => {
        const atoms = buildUsers(users);
        let woken = 0;
        for (const u of users) atoms.get(u.id)!.listen(() => woken++);
        const slice = users.slice(0, Math.max(1, users.length / 10));
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                for (const u of slice) {
                    const a = atoms.get(u.id)!;
                    a.set({ ...a.get(), name: `n${n}` });
                }
                n++;
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    burstCoalescing: (users, rewrites) => {
        const atoms = buildUsers(users);
        const hot = users.slice(0, 100);
        let woken = 0;
        for (const u of hot) atoms.get(u.id)!.listen(() => woken++);
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                for (let r = 0; r < rewrites; r++) {
                    for (const u of hot) {
                        const a = atoms.get(u.id)!;
                        a.set({ ...a.get(), name: `n${n}` });
                    }
                    n++;
                }
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    fanOutRecompute: (users, derived, updates) => {
        const atoms = buildUsers(users);
        let recomputes = 0;
        let wakeups = 0;
        for (let i = 0; i < derived; i++) {
            const name = nanoComputed(atoms.get(users[i].id)!, (u: TUser) => {
                recomputes++;
                return u.name;
            });
            name.subscribe(() => wakeups++);
        }
        const target = atoms.get(users[0].id)!;
        let n = 0;
        return {
            setup: () => {
                target.set({ ...target.get(), name: `settle${n++}` });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    target.set({ ...target.get(), name: `n${n++}` });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    diamondGlitch: (users, updates) => {
        const atoms = buildUsers(users);
        const source = atoms.get(users[0].id)!;
        const a = nanoComputed(source, (u: TUser) => u.name.length);
        const b = nanoComputed(source, (u: TUser) => u.name.toUpperCase());
        let recomputes = 0;
        const c = nanoComputed([a, b], (x: number, y: string) => {
            recomputes++;
            return `${x}:${y}`;
        });
        let wakeups = 0;
        c.subscribe(() => wakeups++);
        let n = 0;
        return {
            setup: () => {
                source.set({ ...source.get(), name: `settle-${n++}` });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    source.set({ ...source.get(), name: `name-${n++}` });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    deepGraphGlitch: (users, depth, updates) => {
        const atoms = buildUsers(users);
        const source = atoms.get(users[0].id)!;
        const chain: { get: () => string }[] = [];
        chain.push(nanoComputed(source, (u: TUser) => u.name));
        for (let level = 1; level < depth; level++) {
            chain.push(
                nanoComputed(
                    chain[level - 1] as ReturnType<typeof atom<string>>,
                    (value: string) => value
                )
            );
        }
        const tail = chain[depth - 1];
        const faces = chain.filter((_, level) => level % 2 === 1);
        let recomputes = 0;
        let inconsistencies = 0;
        const final = nanoComputed(
            [source, tail, ...faces] as ReturnType<typeof atom<unknown>>[],
            (user: TUser, deep: string, ...faceValues: string[]) => {
                recomputes++;
                const direct = user.name;
                for (const value of faceValues) {
                    if (value !== direct) inconsistencies++;
                }
                if (direct !== deep) inconsistencies++;
                return `${direct}|${deep}`;
            }
        );
        let wakeups = 0;
        final.subscribe(() => wakeups++);
        let n = 0;
        return {
            setup: () => {
                source.set({ ...source.get(), name: `settle-${n++}` });
                recomputes = 0;
                wakeups = 0;
                inconsistencies = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    source.set({ ...source.get(), name: `name-${n++}` });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
            inconsistencies: () => inconsistencies,
        };
    },

    /** The atom holds the whole user, so a write to `active` re-runs the computed over `name`. */
    unrelatedFieldWakeups: (users, updates) => {
        const atoms = buildUsers(users);
        const source = atoms.get(users[0].id)!;
        let recomputes = 0;
        const name = nanoComputed(source, (u: TUser) => {
            recomputes++;
            return u.name;
        });
        let wakeups = 0;
        name.subscribe(() => wakeups++);
        let flag = false;
        return {
            setup: () => {
                flag = !flag;
                source.set({ ...source.get(), active: flag });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    flag = !flag;
                    source.set({ ...source.get(), active: flag });
                }
            },
            verify: () => true,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    memoryForEntities: users => ({
        build: () => ({ atoms: buildUsers(users) }),
    }),

    memoryForSubscriptions: users => ({
        build: () => {
            const atoms = buildUsers(users);
            const stops = users.map(u => atoms.get(u.id)!.listen(() => undefined));
            return { atoms, stops };
        },
    }),
};
